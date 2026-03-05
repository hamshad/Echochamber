import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 3000;
const TTL = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL = 60 * 1000; // 60 seconds

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });

const items = new Map();

function getActiveItems() {
  const now = Date.now();
  return Array.from(items.values()).filter(i => i.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt);
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e9 });

// API: GET /api/items
app.get('/api/items', (req, res) => {
  res.json(getActiveItems());
});

// POST /api/text
app.post('/api/text', (req, res) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Content is required' });
  }
  const id = uuidv4();
  const now = Date.now();
  const item = {
    id,
    type: 'text',
    content,
    filename: null,
    originalName: null,
    mimetype: null,
    size: Buffer.byteLength(content, 'utf8'),
    createdAt: now,
    expiresAt: now + TTL
  };
  items.set(id, item);
  io.emit('item:added', item);
  return res.status(201).json(item);
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file provided' });
  const id = uuidv4();
  const now = Date.now();
  const item = {
    id,
    type: 'file',
    content: null,
    filename: file.filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    createdAt: now,
    expiresAt: now + TTL
  };
  items.set(id, item);
  io.emit('item:added', item);
  return res.status(201).json(item);
});

// GET /api/download/:id
app.get('/api/download/:id', (req, res) => {
  const id = req.params.id;
  const item = items.get(id);
  if (!item || item.expiresAt <= Date.now()) return res.status(404).json({ error: 'Not found' });
  if (item.type !== 'file') return res.status(400).json({ error: 'Not a file item' });
  const filePath = path.join(UPLOADS_DIR, item.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Disposition', `attachment; filename="${item.originalName}"`);
  res.setHeader('Content-Type', item.mimetype || 'application/octet-stream');
  return res.download(filePath, item.originalName);
});

// DELETE /api/items/:id
app.delete('/api/items/:id', (req, res) => {
  const id = req.params.id;
  const item = items.get(id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (item.type === 'file' && item.filename) {
    const filePath = path.join(UPLOADS_DIR, item.filename);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') console.error('[Delete] Failed to delete file:', err.message);
    });
  }
  items.delete(id);
  io.emit('item:removed', { id });
  return res.json({ success: true });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);
  socket.emit('items:sync', getActiveItems());
});

// Cleanup scheduler
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, item] of items) {
    if (now > item.expiresAt) {
      if (item.type === 'file' && item.filename) {
        const filePath = path.join(UPLOADS_DIR, item.filename);
        fs.unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') console.error('[Cleanup] Failed to delete file:', err.message);
        });
      }
      items.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[Cleanup] Removed ${cleaned} expired item(s)`);
    io.emit('items:sync', getActiveItems());
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
