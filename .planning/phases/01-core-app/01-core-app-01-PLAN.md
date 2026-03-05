---
phase: 01-core-app
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - .gitignore
  - server.js
autonomous: true
requirements: [SHARE-01, SHARE-02, CLEAN-01, NET-01]

must_haves:
  truths:
    - "Server starts and listens on configurable port (default 3000)"
    - "POST /api/text stores text with unique ID and 1hr TTL, broadcasts via Socket.IO"
    - "POST /api/upload accepts any file type/size, stores on disk with 1hr TTL, broadcasts via Socket.IO"
    - "GET /api/items returns all non-expired items sorted by newest first"
    - "GET /api/download/:id serves file with original filename and correct Content-Type"
    - "DELETE /api/items/:id removes item from memory and file from disk, broadcasts removal"
    - "Expired items are automatically cleaned up every 60 seconds (metadata + files)"
    - "Server prints all local network IPs with shareable URL on startup"
  artifacts:
    - path: "package.json"
      provides: "Project manifest with 4 dependencies"
      contains: "express"
    - path: ".gitignore"
      provides: "Git ignore rules for node_modules, uploads, etc"
      contains: "node_modules"
    - path: "server.js"
      provides: "Complete backend server (~180-220 lines)"
      min_lines: 150
  key_links:
    - from: "server.js"
      to: "socket.io"
      via: "Socket.IO Server attached to http.createServer"
      pattern: "new Server\\("
    - from: "server.js"
      to: "uploads/"
      via: "multer diskStorage writing files to uploads directory"
      pattern: "multer|diskStorage"
    - from: "server.js"
      to: "public/"
      via: "express.static serving frontend files"
      pattern: "express\\.static"
---

<objective>
Build the complete backend server for Echochamber — a local-network file/text sharing app.

Purpose: Provide the API layer, Socket.IO real-time events, file storage, and auto-cleanup that powers the entire application. This is the foundation that the frontend (Plan 02) connects to.

Output: A running Express server with REST API, Socket.IO, multer file uploads, in-memory metadata store, disk-based file storage, 1-hour TTL cleanup scheduler, and startup banner showing shareable LAN URLs.
</objective>

<execution_context>
@/Users/moksha/.config/opencode/get-shit-done/workflows/execute-plan.md
@/Users/moksha/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Project scaffold + Express server with full REST API and Socket.IO</name>
  <files>package.json, .gitignore, server.js</files>
  <action>
  **Step 1: Create package.json**
  ```json
  {
    "name": "echochamber",
    "version": "1.0.0",
    "description": "Local network file and text sharing",
    "type": "module",
    "scripts": {
      "start": "node server.js"
    },
    "dependencies": {
      "express": "^4.21.0",
      "multer": "^1.4.5-lts.1",
      "socket.io": "^4.8.0",
      "uuid": "^11.0.0"
    }
  }
  ```

  **Step 2: Create .gitignore**
  ```
  node_modules/
  uploads/
  .DS_Store
  *.log
  ```

  **Step 3: Run `npm install`**

  **Step 4: Create server.js with complete implementation:**

  IMPORTS: express, http (node:http), Server from socket.io, multer, v4 as uuidv4 from uuid, fs from node:fs, path from node:path, os from node:os, fileURLToPath from node:url.

  CONSTANTS:
  - `PORT = process.env.PORT || 3000`
  - `TTL = 60 * 60 * 1000` (1 hour in ms)
  - `CLEANUP_INTERVAL = 60 * 1000` (60 seconds)
  - `__dirname` derived from `import.meta.url` for ES modules
  - `UPLOADS_DIR = path.join(__dirname, 'uploads')`

  STARTUP DIRS: Create `uploads/` and `public/` dirs with `fs.mkdirSync(dir, { recursive: true })`.

  IN-MEMORY STORE: `const items = new Map()` — each entry keyed by UUID, value is an object:
  ```
  {
    id: string,
    type: 'text' | 'file',
    content: string (for text) | null (for file),
    filename: string (uuid-based disk name, for file) | null,
    originalName: string (original upload name, for file) | null,
    mimetype: string | null,
    size: number (bytes),
    createdAt: number (Date.now()),
    expiresAt: number (Date.now() + TTL)
  }
  ```

  EXPRESS SETUP:
  - `const app = express()`
  - `app.use(express.json({ limit: '50mb' }))` — generous limit for large text pastes
  - `app.use(express.static(path.join(__dirname, 'public')))` — serve frontend

  MULTER SETUP:
  - Use `multer.diskStorage` with destination: `UPLOADS_DIR`, filename: `(req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))`
  - Create multer instance with NO size limit: `const upload = multer({ storage })`

  HTTP + SOCKET.IO:
  - `const server = http.createServer(app)`
  - `const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 1e9 })` — allow large payloads, allow any origin for LAN

  API ROUTES:

  `GET /api/items`:
  - Filter items Map to non-expired entries (expiresAt > Date.now())
  - Convert to array, sort by createdAt descending (newest first)
  - Return JSON array

  `POST /api/text`:
  - Read `req.body.content` (string)
  - Validate: if empty or not string, return 400 `{ error: 'Content is required' }`
  - Create item object with type='text', generate id with uuidv4()
  - Store in items Map
  - Emit `io.emit('item:added', item)`
  - Return 201 with item JSON

  `POST /api/upload` (use `upload.single('file')` middleware):
  - Read uploaded file from `req.file`
  - If no file, return 400 `{ error: 'No file provided' }`
  - Create item object with type='file', id=uuidv4(), filename=req.file.filename, originalName=req.file.originalname, mimetype=req.file.mimetype, size=req.file.size
  - Store in items Map
  - Emit `io.emit('item:added', item)`
  - Return 201 with item JSON

  `GET /api/download/:id`:
  - Look up item in Map by id
  - If not found or expired, return 404 `{ error: 'Not found' }`
  - If type is not 'file', return 400 `{ error: 'Not a file item' }`
  - Build file path: `path.join(UPLOADS_DIR, item.filename)`
  - Check file exists with `fs.existsSync`, return 404 if missing
  - Set headers: `Content-Disposition: attachment; filename="<originalName>"`, `Content-Type: <mimetype>`
  - Use `res.download(filePath, item.originalName)`

  `DELETE /api/items/:id`:
  - Look up item in Map
  - If not found, return 404
  - If type='file', delete file from disk: `fs.unlink(path.join(UPLOADS_DIR, item.filename), () => {})` (ignore errors)
  - Delete from Map
  - Emit `io.emit('item:removed', { id })`
  - Return 200 `{ success: true }`

  SOCKET.IO CONNECTION:
  - `io.on('connection', (socket) => { ... })`
  - On connection, send current non-expired items: `socket.emit('items:sync', getActiveItems())` where `getActiveItems()` returns the sorted, filtered array
  - Log connections: `console.log('[Socket.IO] Client connected:', socket.id)`

  HELPER: `function getActiveItems()` — returns Array.from(items.values()).filter(i => i.expiresAt > Date.now()).sort((a,b) => b.createdAt - a.createdAt)
  </action>
  <verify>
    <automated>npm install && node -e "import('./server.js')" &amp; sleep 2 &amp;&amp; curl -sf http://localhost:3000/api/items &amp;&amp; kill %1 || (kill %1 2>/dev/null; echo 'Verify manually with npm start')</automated>
    <manual>Run `npm start`, then in another terminal: `curl http://localhost:3000/api/items` should return `[]`</manual>
  </verify>
  <done>Server starts, serves static files from public/, all 5 API endpoints respond correctly, Socket.IO accepts connections and syncs items</done>
</task>

<task type="auto">
  <name>Task 2: Auto-cleanup scheduler, network IP detection, graceful shutdown</name>
  <files>server.js</files>
  <action>
  Extend server.js (from Task 1) with these additions — add BEFORE the `server.listen()` call:

  **Cleanup Scheduler:**
  ```
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
  ```

  **Network IP Detection function:**
  ```
  function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const [name, nets] of Object.entries(interfaces)) {
      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push({ name, address: net.address });
        }
      }
    }
    return ips;
  }
  ```

  **Startup banner (inside server.listen callback):**
  Print a nicely formatted box to console:
  ```
  console.log('\n' + '═'.repeat(50));
  console.log('  🔗 Echochamber is running!\n');
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of getLocalIPs()) {
    console.log(`  Network: http://${ip.address}:${PORT}  (${ip.name})`);
  }
  console.log('\n  Share the Network URL with anyone on your WiFi');
  console.log('  Items auto-delete after 1 hour');
  console.log('═'.repeat(50) + '\n');
  ```

  **Graceful shutdown:**
  ```
  function shutdown() {
    console.log('\n[Server] Shutting down...');
    clearInterval(cleanupTimer);
    io.close();
    server.close(() => {
      console.log('[Server] Goodbye!');
      process.exit(0);
    });
    // Force exit after 5s if server doesn't close
    setTimeout(() => process.exit(0), 5000);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  ```

  **Ensure server.listen is the LAST thing:**
  ```
  server.listen(PORT, () => {
    // ... startup banner here
  });
  ```
  </action>
  <verify>
    <automated>node -e "
      import os from 'node:os';
      const nets = os.networkInterfaces();
      const ips = Object.entries(nets).flatMap(([name, nets]) => nets.filter(n => n.family === 'IPv4' && !n.internal).map(n => ({ name, address: n.address })));
      console.log('LAN IPs:', ips.map(i => i.address).join(', '));
      if (ips.length === 0) { console.error('No LAN IP found — are you connected to WiFi?'); process.exit(1); }
      console.log('IP detection OK');
    "</automated>
    <manual>Run `npm start`, verify box with network URL appears. Create a text item via curl, wait 61 seconds, check console for cleanup log.</manual>
  </verify>
  <done>Cleanup scheduler runs every 60s and removes expired items (both metadata and files), startup prints all LAN IPs in a formatted banner, Ctrl+C shuts down gracefully</done>
</task>

</tasks>

<verification>
1. `npm start` — server starts, prints banner with local + network URLs
2. `curl -X POST http://localhost:3000/api/text -H 'Content-Type: application/json' -d '{"content":"hello from curl"}'` — returns 201 with item JSON
3. `curl -F "file=@./package.json" http://localhost:3000/api/upload` — returns 201 with file item
4. `curl http://localhost:3000/api/items` — returns array with both items
5. `curl http://localhost:3000/api/download/<file-id>` — downloads the file
6. `curl -X DELETE http://localhost:3000/api/items/<text-id>` — removes the text item
7. Ctrl+C — server shuts down gracefully
</verification>

<success_criteria>
- Server starts on port 3000 with one command (`npm start`)
- All 5 API endpoints work correctly (GET items, POST text, POST upload, GET download, DELETE item)
- Socket.IO accepts connections and broadcasts item:added, item:removed, items:sync events
- Cleanup scheduler removes items older than 1 hour and deletes associated files from disk
- Startup banner shows localhost + all LAN IPs with shareable URLs
- Graceful shutdown on SIGINT/SIGTERM
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-app/01-core-app-01-SUMMARY.md`
</output>
