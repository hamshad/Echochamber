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
import 'dotenv/config';

const PORT = process.env.PORT || 3000;
const TTL = parseInt(process.env.TTL_MS, 10) || 60 * 60 * 1000; // 1 hour (configurable for tests)
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MS, 10) || 60 * 1000; // 60 seconds
// Firebase Storage requires a billing account, so file bytes live in Realtime
// Database. RTDB caps a single value at ~16 MB, so large files are split into
// chunks: the browser sends ~1 MB requests, the server reassembles on download.
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 100 * 1024 * 1024; // 100 MB per file
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE, 10) || 1024 * 1024; // 1 MB raw per request (Vercel-safe)
const MAX_BULK_FILES = parseInt(process.env.MAX_BULK_FILES, 10) || 20;
const SINGLE_MAX_FILE_SIZE = 8 * 1024 * 1024; // cap for the legacy one-shot endpoint

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
let fileDataRef;
let uploadsRef;
try {
  db = getDatabase();
  if (!db) throw new Error('getDatabase() returned null');
  itemsRef = db.ref('items');
  fileDataRef = db.ref('fileData');
  uploadsRef = db.ref('uploads');
} catch (e) {
  console.error('[Startup] Firebase Database init error:', e.message);
  if (process.env.VERCEL) throw e;
}

// File bytes live in RTDB so uploads work without a Firebase billing account.
// Metadata in /items stays small; /fileData is read only on download.
async function saveFileBytes(id, buffer) {
  if (!fileDataRef) throw new Error('Realtime Database unavailable');
  await fileDataRef.child(id).set({
    encoding: 'base64',
    data: buffer.toString('base64'),
    updatedAt: Date.now()
  });
}

async function readFileBytes(id) {
  if (!fileDataRef) return null;
  const snapshot = await fileDataRef.child(id).once('value');
  const stored = snapshot.val();
  if (!stored || typeof stored.data !== 'string') return null;
  return Buffer.from(stored.data, stored.encoding || 'base64');
}

async function readChunkedFile(id) {
  if (!fileDataRef) return null;
  const snapshot = await fileDataRef.child(id).child('chunks').once('value');
  const stored = snapshot.val() || {};
  const keys = Object.keys(stored).sort((a, b) => Number(a) - Number(b));
  if (!keys.length) return null;
  return Buffer.concat(keys.map(k => Buffer.from(stored[k], 'base64')));
}

async function removeFileBytes(id) {
  if (!fileDataRef) return;
  await fileDataRef.child(id).remove();
}

// Removes bytes for all RTDB schemes (single value or chunks) plus any pending upload.
async function removeStoredFile(item, id) {
  if (item.storage === 'rtdb' || item.storage === 'rtdb-chunks' || (!item.filename && item.type === 'file')) {
    await removeFileBytes(id).catch((err) => {
      if (!/not found/i.test(err && err.message)) console.error('[File] RTDB delete error:', err && err.message);
    });
  }
  if (uploadsRef) await uploadsRef.child(id).remove().catch(() => {});
  if (item.filename) {
    await bucket.file(item.filename).delete().catch((err) => {
      if (err && err.code !== 404) console.error('[File] Storage delete error:', err && err.message);
    });
  }
}

// Orphaned / abandoned chunked uploads are cleaned up with the same TTL.
async function cleanupPendingUploads(now) {
  if (!uploadsRef) return 0;
  const snapshot = await uploadsRef.once('value');
  const pending = snapshot.val() || {};
  let cleaned = 0;
  for (const id in pending) {
    if (now > pending[id].expiresAt) {
      await uploadsRef.child(id).remove();
      await fileDataRef.child(id).remove();
      cleaned++;
    }
  }
  return cleaned;
}

function safeDownloadName(name) {
  return String(name || 'download').replace(/["\r\n]/g, '_');
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

// Multer setup — memory buffers; bytes are saved to RTDB (or Storage for legacy items)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SINGLE_MAX_FILE_SIZE } });
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CHUNK_SIZE + 64 * 1024 } });

const server = http.createServer(app);

// Origin-based access control — protect all /api/ endpoints except cleanup (cron)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (ALLOWED_ORIGINS.length) {
  app.use('/api', (req, res, next) => {
    if (req.path === '/cleanup') return next();
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    const sameOrigin = `${req.protocol}://${req.get('host')}`;
    // Allow same-origin requests (any deployment host) plus configured origins
    const allowed = !origin || origin === sameOrigin ||
      ALLOWED_ORIGINS.some(o => origin.startsWith(o) || referer.startsWith(o));
    if (allowed) return next();
    return res.status(401).json({ error: 'Unauthorized origin' });
  });
  console.log(`[Startup] API access restricted to origins: ${ALLOWED_ORIGINS.join(', ')}`);
} else {
  console.warn('[Startup] WARNING: ALLOWED_ORIGINS not set — API endpoints are unprotected');
}

// API: GET /api/items
app.get('/api/items', async (req, res) => {
  const showAll = req.query.all === '1';
  const roomId = showAll ? null : getRoomId(req);
  res.json(await getActiveItems(roomId));
});

// GET /api/cleanup
// This is meant to be called by a Vercel Cron Job
app.get('/api/cleanup', async (req, res) => {
  // Optional: check for Vercel Cron secret header if configured
  // if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return res.status(401).end();
  // }
  
  console.log('[Cleanup] Manual trigger received');
  const now = Date.now();
  try {
    const snapshot = await itemsRef.once('value');
    const items = snapshot.val() || {};
    let cleaned = 0;
    for (const id in items) {
      const item = items[id];
      if (now > item.expiresAt) {
        if (item.type === 'file') await removeStoredFile(item, id);
        await itemsRef.child(id).remove();
        cleaned++;
      }
    }
    cleaned += await cleanupPendingUploads(now);
    console.log(`[Cleanup] Successfully removed ${cleaned} expired item(s)`);
    return res.json({ success: true, cleaned });
  } catch (err) {
    console.error('[Cleanup] Failed:', err.message);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
});

// GET /api/whoami
app.get('/api/whoami', (req, res) => {
  res.json({ ip: getRoomId(req) });
});

// GET /api/calvin — random Calvin & Hobbes strip from Tumblr
app.get('/api/calvin', async (req, res) => {
  const apiKey = process.env.TUMBLER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'TUMBLER_API_KEY not configured' });
  const offset = Math.floor(Math.random() * 3900);
  try {
    const r = await fetch(`https://api.tumblr.com/v2/blog/calvinandhobbes-daily.tumblr.com/posts/photo?type=photo&offset=${offset}&limit=1&api_key=${apiKey}`);
    if (!r.ok) return res.status(502).json({ error: 'Tumblr API error' });
    const data = await r.json();
    const post = data?.response?.posts?.[0];
    if (!post) return res.status(404).json({ error: 'No post found' });
    const imageUrl = post.photos?.[0]?.alt_sizes?.[0]?.url || null;
    const caption = post.summary || 'Calvin and Hobbes';
    if (!imageUrl) return res.status(404).json({ error: 'No image found' });
    res.json({ imageUrl, caption });
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch from Tumblr' });
  }
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

// GET /api/config — client needs chunk size and limits before uploading
app.get('/api/config', (req, res) => {
  res.json({ chunkSize: CHUNK_SIZE, maxFileSize: MAX_FILE_SIZE, maxBulkFiles: MAX_BULK_FILES });
});

// POST /api/upload/begin — register a chunked upload, get server-assigned id
app.post('/api/upload/begin', async (req, res) => {
  const { name, size, mimetype } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'File name is required' });
  if (!Number.isFinite(Number(size)) || Number(size) < 0) return res.status(400).json({ error: 'Invalid file size' });
  const fileSize = Math.trunc(Number(size));
  if (fileSize > MAX_FILE_SIZE) {
    return res.status(413).json({ error: `File too large (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB)` });
  }

  const id = uuidv4();
  const now = Date.now();
  const totalChunks = Math.max(1, Math.ceil(fileSize / CHUNK_SIZE));
  const pending = {
    id,
    name,
    size: fileSize,
    mimetype: mimetype || 'application/octet-stream',
    chunkSize: CHUNK_SIZE,
    totalChunks,
    received: 0,
    roomId: getRoomId(req),
    createdAt: now,
    expiresAt: now + TTL
  };

  try {
    await uploadsRef.child(id).set(pending);
  } catch (err) {
    console.error('[Upload] Begin error:', err && err.message);
    return res.status(500).json({ error: 'Failed to start upload' });
  }

  // Empty files need no chunks.
  if (fileSize === 0) {
    const item = {
      id, type: 'file', roomId: pending.roomId, content: null, filename: null,
      storage: 'rtdb-chunks', chunkCount: 0, originalName: name,
      mimetype: pending.mimetype, size: 0, createdAt: now, expiresAt: now + TTL
    };
    try {
      await itemsRef.child(id).set(item);
      await uploadsRef.child(id).remove();
      return res.status(201).json({ id, chunkSize: CHUNK_SIZE, totalChunks: 0, item });
    } catch (err) {
      await uploadsRef.child(id).remove().catch(() => {});
      return res.status(500).json({ error: 'Failed to save item metadata' });
    }
  }

  return res.status(201).json({ id, chunkSize: CHUNK_SIZE, totalChunks });
});

// POST /api/upload/chunk — one ~1 MB piece; final piece creates the item
app.post('/api/upload/chunk', chunkUpload.single('file'), async (req, res) => {
  const id = req.body && req.body.id;
  const index = parseInt(req.body && req.body.index, 10);
  const chunk = req.file;
  if (!id || !Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'Invalid chunk id/index' });
  if (!chunk) return res.status(400).json({ error: 'No chunk provided' });

  try {
    const snapshot = await uploadsRef.child(id).once('value');
    const pending = snapshot.val();
    if (!pending) return res.status(404).json({ error: 'Upload not found or expired' });
    if (pending.roomId !== getRoomId(req)) return res.status(403).json({ error: 'Forbidden' });
    if (index >= pending.totalChunks) return res.status(400).json({ error: 'Invalid chunk index' });
    if (chunk.size > pending.chunkSize) return res.status(400).json({ error: 'Chunk too large' });

    // Idempotent per-index marker so retried chunks cannot double-count.
    const token = uuidv4();
    const markerRef = uploadsRef.child(id).child('seen').child(String(index));
    const marker = await markerRef.transaction(v => v || token);
    const mine = marker.snapshot.val() === token;
    if (mine) {
      await fileDataRef.child(id).child('chunks').child(String(index)).set(chunk.buffer.toString('base64'));
      const inc = await uploadsRef.child(id).child('received').transaction(n => (n || 0) + 1);
      const received = inc.snapshot.val();
      if (received === pending.totalChunks) {
        const now = Date.now();
        const item = {
          id, type: 'file', roomId: pending.roomId, content: null, filename: null,
          storage: 'rtdb-chunks', chunkCount: pending.totalChunks, originalName: pending.name,
          mimetype: pending.mimetype, size: pending.size, createdAt: now, expiresAt: now + TTL
        };
        await itemsRef.child(id).set(item);
        await uploadsRef.child(id).remove();
        console.log(`[DB] Saved chunked file room=${item.roomId} id=${id} bytes=${pending.size}`);
        return res.status(201).json(item);
      }
      return res.json({ id, received, total: pending.totalChunks });
    }

    const current = await uploadsRef.child(id).child('received').once('value');
    return res.json({ id, received: current.val() || 0, total: pending.totalChunks });
  } catch (err) {
    console.error('[Upload] Chunk error:', err && err.message);
    return res.status(500).json({ error: 'Chunk upload failed' });
  }
});

// DELETE /api/upload/:id — cancel an in-flight chunked upload
app.delete('/api/upload/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const snapshot = await uploadsRef.child(id).once('value');
    if (!snapshot.exists()) return res.status(404).json({ error: 'Upload not found' });
    if (snapshot.val().roomId !== getRoomId(req)) return res.status(403).json({ error: 'Forbidden' });
    await uploadsRef.child(id).remove();
    await fileDataRef.child(id).remove();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Cancel failed' });
  }
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  const id = uuidv4();
  const now = Date.now();

  // Store bytes first. RTDB does not require a billing account (unlike Storage).
  try {
    await saveFileBytes(id, file.buffer);
  } catch (err) {
    console.error('[Upload] File storage error:', err && err.message);
    return res.status(500).json({ error: 'Failed to store file' });
  }

  const roomId = getRoomId(req);
  const item = {
    id,
    type: 'file',
    roomId,
    content: null,
    filename: null,
    storage: 'rtdb',
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    createdAt: now,
    expiresAt: now + TTL
  };

  try {
    await itemsRef.child(id).set(item);
    console.log(`[DB] Saved file room=${item.roomId} id=${id} bytes=${file.size}`);
    return res.status(201).json(item);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
    await removeFileBytes(id).catch(() => {}); // roll back orphaned bytes
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

    res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName(item.originalName)}"`);
    res.setHeader('Content-Type', item.mimetype || 'application/octet-stream');

    if (item.storage === 'rtdb-chunks') {
      const buffer = await readChunkedFile(id);
      if (!buffer) return res.status(404).json({ error: 'File data not found' });
      return res.send(buffer);
    }

    if (item.storage === 'rtdb' || !item.filename) {
      const buffer = await readFileBytes(id);
      if (!buffer) return res.status(404).json({ error: 'File data not found' });
      return res.send(buffer);
    }

    // Legacy items stored in Firebase Storage
    bucket.file(item.filename).createReadStream()
      .on('error', (err) => {
        console.error('[Download] Firebase read error:', err && err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
      })
      .pipe(res);
  } catch (err) {
    console.error('[Download] Error:', err && err.message);
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/items/:id/extend — add or remove hours from an item's TTL
const MIN_TTL_MS = 60 * 1000;
const IMMORTAL_EXPIRES_AT = 9000000000000000;
app.post('/api/items/:id/extend', async (req, res) => {
  const id = req.params.id;
  const { hours = 0, minutes = 0 } = req.body || {};
  const h = Number(hours), m = Number(minutes);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return res.status(400).json({ error: 'Invalid duration' });
  const deltaMs = (h * 60 + m) * 60 * 1000;
  if (deltaMs === 0) return res.status(400).json({ error: 'Provide a non-zero duration' });
  try {
    const snapshot = await itemsRef.child(id).once('value');
    const item = snapshot.val();
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.expiresAt <= Date.now()) return res.status(410).json({ error: 'Item already expired' });
    if (item.expiresAt >= IMMORTAL_EXPIRES_AT) return res.status(400).json({ error: 'Immortal items cannot be adjusted' });
    const roomId = getRoomId(req);
    if (item.roomId !== roomId) return res.status(403).json({ error: 'Forbidden' });
    const newExpiresAt = Math.max(Date.now() + MIN_TTL_MS, item.expiresAt + deltaMs);
    await itemsRef.child(id).update({ expiresAt: newExpiresAt });
    return res.json({ success: true, expiresAt: newExpiresAt });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to adjust TTL' });
  }
});

// POST /api/items/:id/immortal — make an item never expire
app.post('/api/items/:id/immortal', async (req, res) => {
  const id = req.params.id;
  try {
    const snapshot = await itemsRef.child(id).once('value');
    const item = snapshot.val();
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.expiresAt >= 9000000000000000) return res.json({ success: true, expiresAt: item.expiresAt, message: 'Already immortal' });
    const roomId = getRoomId(req);
    if (item.roomId !== roomId) return res.status(403).json({ error: 'Forbidden' });
    const IMMORTAL = 9007199254740991; // Number.MAX_SAFE_INTEGER
    await itemsRef.child(id).update({ expiresAt: IMMORTAL });
    return res.json({ success: true, expiresAt: IMMORTAL });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to make item immortal' });
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

    if (item.type === 'file') await removeStoredFile(item, id);
    await itemsRef.child(id).remove();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Delete failed' });
  }
});

// Multer / body errors (e.g. oversized uploads) return JSON instead of an HTML 500
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const max = req.path.endsWith('/chunk') ? CHUNK_SIZE : SINGLE_MAX_FILE_SIZE;
      return res.status(413).json({ error: `Too large (max ${max >= 1024 * 1024 ? Math.round(max / 1024 / 1024) + ' MB' : Math.round(max / 1024) + ' KB'})` });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error('[Server] Unhandled middleware error:', err && err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
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
        if (item.type === 'file') await removeStoredFile(item, id);
        await itemsRef.child(id).remove();
        cleaned++;
      }
    }
    cleaned += await cleanupPendingUploads(now);
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

export default app;

// Exports for testing
export { server, itemsRef as items, fileDataRef, uploadsRef, bucket, normalizeIp, getRoomId, getActiveItems, cleanupTimer, TTL, PORT, MAX_FILE_SIZE, CHUNK_SIZE, MAX_BULK_FILES };
