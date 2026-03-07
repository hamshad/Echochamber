import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const PORT = process.env.PORT || 3000;
const TTL = parseInt(process.env.TTL_MS, 10) || 60 * 60 * 1000; // 1 hour (configurable for tests)
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MS, 10) || 60 * 1000; // 60 seconds

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Firebase Admin initialization
// Prefer environment-provided service account JSON (FIREBASE_SERVICE_ACCOUNT).
// For local development, fall back to reading a service account JSON file if present.
let serviceAccount = {};
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Attempt to find a service account file in project root matching *-firebase-adminsdk-*.json
    const files = fs.readdirSync(__dirname).filter(f => /firebase-adminsdk-.*\.json$/.test(f));
    if (files.length) {
      serviceAccount = JSON.parse(fs.readFileSync(path.join(__dirname, files[0]), 'utf8'));
    }
  }
} catch (e) {
  console.warn('[Startup] Could not parse Firebase service account JSON — Firebase init will be attempted with empty credentials');
}

const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'rnfirebase-c3268.firebasestorage.app';
try {
  if (serviceAccount && Object.keys(serviceAccount).length) {
    initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName });
  } else {
    // initializeApp without explicit credential will let Firebase SDK attempt default credentials
    initializeApp({ storageBucket: bucketName });
  }
} catch (e) {
  console.warn('[Startup] Firebase initializeApp warning:', e && e.message);
}
const bucket = getStorage().bucket();

const items = new Map();

function getActiveItems(roomId) {
  const now = Date.now();
  return Array.from(items.values())
    .filter(i => i.expiresAt > now && (!roomId || i.roomId === roomId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust reverse proxies (Vercel) so req.ip and x-forwarded-for are populated correctly
app.set('trust proxy', true);

// Helper: extract public IP (roomId) from request
function getRoomId(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = forwarded ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || 'local');
  return normalizeIp(raw);
}

function normalizeIp(raw) {
  if (!raw) return 'local';
  // remove surrounding whitespace
  let ip = String(raw).trim();
  // If it's a comma-separated list, take the first
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  // IPv6 mapped IPv4 ("::ffff:1.2.3.4") -> "1.2.3.4"
  const v4match = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4match) return v4match[1];
  // Local IPv6 loopback -> 127.0.0.1
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

// Multer setup — use memory storage so we can upload buffers to Firebase Storage
const upload = multer({ storage: multer.memoryStorage() });

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e9 });

// API: GET /api/items
app.get('/api/items', (req, res) => {
  const roomId = getRoomId(req);
  res.json(getActiveItems(roomId));
});

// POST /api/text
app.post('/api/text', (req, res) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }
  const id = uuidv4();
  const now = Date.now();
  const roomId = getRoomId(req);
  const item = {
    id,
    type: 'text',
    roomId,
    content,
    filename: null,
    originalName: null,
    mimetype: null,
    size: Buffer.byteLength(content, 'utf8'),
    createdAt: now,
    expiresAt: now + TTL
  };
  items.set(id, item);
  // Broadcast to the room
  console.log(`[Broadcast] room=${item.roomId} id=${id}`);
  io.to(item.roomId).emit('item:added', item);

  // If uploader provided their socket id (multipart field `socketId`), ensure they get the event
  try {
    const uploaderSocketId = req.body && req.body.socketId;
    if (uploaderSocketId) {
      const sock = io.sockets.sockets.get(uploaderSocketId);
      const inRoom = sock && sock.rooms && sock.rooms.has(item.roomId);
      console.log(`[Upload] uploaderSocketId=${uploaderSocketId} socketFound=${!!sock} inRoom=${!!inRoom} room=${item.roomId}`);
      if (sock && !inRoom) {
        // Fallback direct emit to uploader socket
        io.to(uploaderSocketId).emit('item:added', item);
        console.log('[Upload] fallback emit to uploader socket id', uploaderSocketId);
      }
    }
  } catch (e) {
    // Non-fatal — continue
    console.warn('[Upload] socket emit fallback failed:', e && e.message);
  }
  return res.status(201).json(item);
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  const id = uuidv4();
  const ext = path.extname(file.originalname);
  const storageName = id + ext;

  try {
    const fileRef = bucket.file(storageName);
    await fileRef.save(file.buffer, { metadata: { contentType: file.mimetype } });
  } catch (err) {
    console.error('[Upload] Firebase Storage error:', err && err.message);
    return res.status(500).json({ error: 'Storage upload failed' });
  }

  const now = Date.now();
  const roomId = getRoomId(req);
  const item = {
    id,
    type: 'file',
    roomId,
    content: null,
    filename: storageName,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    createdAt: now,
    expiresAt: now + TTL
  };
  items.set(id, item);
  io.to(item.roomId).emit('item:added', item);
  return res.status(201).json(item);
});

// GET /api/download/:id
app.get('/api/download/:id', (req, res) => {
  const id = req.params.id;
  const item = items.get(id);
  if (!item || item.expiresAt <= Date.now()) return res.status(404).json({ error: 'Not found' });
  if (item.type !== 'file') return res.status(400).json({ error: 'Not a file item' });

  res.setHeader('Content-Disposition', `attachment; filename="${item.originalName}"`);
  res.setHeader('Content-Type', item.mimetype || 'application/octet-stream');

  const fileRef = bucket.file(item.filename);
  fileRef.createReadStream()
    .on('error', (err) => {
      console.error('[Download] Firebase read error:', err && err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    })
    .pipe(res);
});

// DELETE /api/items/:id
app.delete('/api/items/:id', (req, res) => {
  const id = req.params.id;
  const item = items.get(id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const roomId = getRoomId(req);
  if (item.roomId !== roomId) return res.status(403).json({ error: 'Forbidden' });

  if (item.type === 'file' && item.filename) {
    bucket.file(item.filename).delete().catch((err) => {
      // Ignore not-found errors
      if (err && err.code !== 404) console.error('[Delete] Firebase delete error:', err && err.message);
    });
  }
  items.delete(id);
  io.to(item.roomId).emit('item:removed', { id });
  return res.json({ success: true });
});

// Socket.IO
io.on('connection', (socket) => {
  // Extract public IP from handshake headers (x-forwarded-for), fallback to socket address
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  const raw = forwarded ? forwarded.split(',')[0].trim() : (socket.handshake.address || 'local');
  const roomId = normalizeIp(raw);

  socket.join(roomId);
  console.log('[Socket.IO] Client connected:', socket.id, '→ room:', roomId);
  socket.emit('items:sync', getActiveItems(roomId));
});

// Cleanup scheduler
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  const affectedRooms = new Set();
  for (const [id, item] of items) {
    if (now > item.expiresAt) {
      if (item.type === 'file' && item.filename) {
        bucket.file(item.filename).delete().catch((err) => {
          if (err && err.code !== 404) console.error('[Cleanup] Firebase delete error:', err && err.message);
        });
      }
      affectedRooms.add(item.roomId);
      items.delete(id);
      cleaned++;
    }
  }
    if (cleaned > 0) {
      console.log(`[Cleanup] Removed ${cleaned} expired item(s)`);
      for (const roomId of affectedRooms) {
        io.to(roomId).emit('items:sync', getActiveItems(roomId));
      }
    }
}, CLEANUP_INTERVAL);

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const [name, nets] of Object.entries(interfaces)) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ name, address: net.address });
      }
    }
  }
  return ips;
}

function shutdown() {
  console.log('\n[Server] Shutting down...');
  clearInterval(cleanupTimer);
  try { io.close(); } catch (e) {}
  server.close(() => {
    console.log('[Server] Goodbye!');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Only start listening when run directly (not when imported by tests)
// Vercel sets process.env.VERCEL, and usually runs the script via its own runner.
const isMainModule = (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) || process.env.VERCEL;
if (isMainModule) {
  server.listen(PORT, () => {
    console.log('\n' + '═'.repeat(50));
    console.log('  🔗 Echochamber is running!\n');
    console.log(`  Local:   http://localhost:${PORT}`);
    for (const ip of getLocalIPs()) {
      console.log(`  Network: http://${ip.address}:${PORT}  (${ip.name})`);
    }
    console.log('\n  Share the Network URL with anyone on your WiFi');
    console.log('  Items auto-delete after 1 hour');
    console.log('═'.repeat(50) + '\n');
  });
}

// Exports for testing
export { app, server, io, items, bucket, normalizeIp, getRoomId, getActiveItems, cleanupTimer, TTL, PORT };
