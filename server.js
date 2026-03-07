import express from 'express';
import http from 'node:http';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getDatabase } from 'firebase-admin/database';

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
// Database URL must include the full protocol https:// for Realtime DB to work
const databaseURL = process.env.FIREBASE_DATABASE_URL || 'https://rnfirebase-c3268-default-rtdb.firebaseio.com';

try {
  const options = { storageBucket: bucketName, databaseURL };
  if (serviceAccount && Object.keys(serviceAccount).length) {
    options.credential = cert(serviceAccount);
  }
  console.log(`[Startup] Initializing Firebase: bucket=${bucketName}, db=${databaseURL}`);
  if (!databaseURL) throw new Error('FIREBASE_DATABASE_URL is not set');
  initializeApp(options);
} catch (e) {
  console.error('[Startup] Firebase initializeApp error:', e && e.message);
  // Re-throw if it's a critical initialization error to fail the function early
  if (process.env.VERCEL) throw e;
}

const bucket = getStorage().bucket();
let db;
let itemsRef;
try {
  db = getDatabase();
  if (!db) throw new Error('getDatabase() returned null');
  itemsRef = db.ref('items');
} catch (e) {
  console.error('[Startup] Firebase Database init error:', e.message);
  if (process.env.VERCEL) throw e;
}

async function getActiveItems(roomId) {
  if (!itemsRef) return [];
  const now = Date.now();
  console.log(`[DB] getActiveItems room=${roomId || 'all'}`);
  try {
    const snapshot = await itemsRef.once('value').catch(err => {
      console.error('[DB] itemsRef.once failed:', err.message);
      throw err;
    });
    const allItems = snapshot.val() || {};
    return Object.values(allItems)
      .filter(i => i.expiresAt > now && (!roomId || i.roomId === roomId))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.error('[DB] Failed to fetch items:', err.message);
    return [];
  }
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

// API: GET /api/items
app.get('/api/items', async (req, res) => {
  const roomId = getRoomId(req);
  res.json(await getActiveItems(roomId));
});

// GET /api/whoami
app.get('/api/whoami', (req, res) => {
  res.json({ ip: getRoomId(req) });
});

// POST /api/text
app.post('/api/text', async (req, res) => {
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
  
  try {
    await itemsRef.child(id).set(item);
    console.log(`[DB] Saved text room=${item.roomId} id=${id}`);
    return res.status(201).json(item);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
    return res.status(500).json({ error: 'Failed to save item' });
  }
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
  
  try {
    await itemsRef.child(id).set(item);
    console.log(`[DB] Saved file room=${item.roomId} id=${id}`);
    return res.status(201).json(item);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
    return res.status(500).json({ error: 'Failed to save item metadata' });
  }
});

// GET /api/download/:id
app.get('/api/download/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const snapshot = await itemsRef.child(id).once('value');
    const item = snapshot.val();
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
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/items/:id
app.delete('/api/items/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const snapshot = await itemsRef.child(id).once('value');
    const item = snapshot.val();
    if (!item) return res.status(404).json({ error: 'Not found' });
    const roomId = getRoomId(req);
    if (item.roomId !== roomId) return res.status(403).json({ error: 'Forbidden' });

    if (item.type === 'file' && item.filename) {
      bucket.file(item.filename).delete().catch((err) => {
        // Ignore not-found errors
        if (err && err.code !== 404) console.error('[Delete] Firebase delete error:', err && err.message);
      });
    }
    await itemsRef.child(id).remove();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Delete failed' });
  }
});

// Cleanup scheduler
const cleanupTimer = setInterval(async () => {
  const now = Date.now();
  try {
    const snapshot = await itemsRef.once('value');
    const items = snapshot.val() || {};
    let cleaned = 0;
    for (const id in items) {
      const item = items[id];
      if (now > item.expiresAt) {
        if (item.type === 'file' && item.filename) {
          bucket.file(item.filename).delete().catch((err) => {
            if (err && err.code !== 404) console.error('[Cleanup] Firebase delete error:', err && err.message);
          });
        }
        await itemsRef.child(id).remove();
        cleaned++;
      }
    }
    if (cleaned > 0) console.log(`[Cleanup] Removed ${cleaned} expired item(s)`);
  } catch (err) {
    console.error('[Cleanup] Failed:', err.message);
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
// We check for VERCEL or if it's the main module to ensure it runs in both local and cloud.
const isMainModule = (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) || process.env.VERCEL || process.env.NODE_ENV === 'production';
if (isMainModule) {
  console.log('[Startup] Starting server (isMainModule=true, VERCEL=' + !!process.env.VERCEL + ')');
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
export { app, server, itemsRef as items, bucket, normalizeIp, getRoomId, getActiveItems, cleanupTimer, TTL, PORT };
