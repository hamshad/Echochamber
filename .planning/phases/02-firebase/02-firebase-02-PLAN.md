---
phase: 02-firebase
plan: 02
type: execute
wave: 2
depends_on: [02-firebase-01]
files_modified:
  - server.js
autonomous: true
requirements: [STORE-02, STORE-03, STORE-04]

must_haves:
  truths:
    - "GET /api/download/:id streams file from Firebase Storage to client with correct filename"
    - "DELETE /api/items/:id removes the file from Firebase Storage"
    - "Cleanup scheduler deletes expired files from Firebase Storage"
    - "No reference to local fs.unlink, UPLOADS_DIR, or uploads/ directory remains in server.js"
  artifacts:
    - path: "server.js"
      provides: "Firebase-based download stream, delete, and cleanup"
      contains: "bucket.file"
  key_links:
    - from: "GET /api/download/:id"
      to: "Firebase Storage"
      via: "bucket.file(item.filename).createReadStream()"
      pattern: "createReadStream"
    - from: "DELETE /api/items/:id"
      to: "Firebase Storage"
      via: "bucket.file(item.filename).delete()"
      pattern: "bucket\\.file.*\\.delete"
    - from: "cleanup scheduler"
      to: "Firebase Storage"
      via: "bucket.file(item.filename).delete()"
      pattern: "bucket\\.file.*\\.delete"
---

<objective>
Complete the Firebase Storage migration by replacing all remaining local file I/O (download streaming, delete, cleanup) with Firebase Storage equivalents — and remove all leftover local disk references.

Purpose: Plan 01 handled upload. This plan handles the read/delete side. After this plan, server.js has zero dependency on the local filesystem for file storage.

Output:
- server.js with Firebase-based download (streaming), delete, and cleanup scheduler
- No UPLOADS_DIR, no fs.unlink, no uploads/ path references
</objective>

<execution_context>
@/Users/moksha/.config/opencode/get-shit-done/workflows/execute-plan.md
@/Users/moksha/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@server.js
@.planning/phases/02-firebase/02-firebase-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Stream download from Firebase Storage in GET /api/download/:id</name>
  <files>server.js</files>
  <action>
    Replace the GET /api/download/:id handler. Currently it uses `res.download(filePath)` from local disk. New version streams directly from Firebase Storage:

    ```js
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
          console.error('[Download] Firebase read error:', err.message);
          if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
        })
        .pipe(res);
    });
    ```

    Remove the old `if (!fs.existsSync(filePath))` check — Firebase handles missing files via the error event.
    Remove the `const filePath = path.join(UPLOADS_DIR, item.filename)` line from this handler.
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('server.js','utf8'); if(!s.includes('createReadStream')) { process.exit(1); } console.log('download handler ok');"</automated>
  </verify>
  <done>GET /api/download/:id streams file from Firebase Storage via createReadStream().pipe(res), sets correct Content-Disposition and Content-Type headers, handles Firebase errors gracefully.</done>
</task>

<task type="auto">
  <name>Task 2: Delete from Firebase in DELETE handler + cleanup scheduler, remove all local fs references</name>
  <files>server.js</files>
  <action>
    **Step A — Update DELETE /api/items/:id handler:**

    Replace the `fs.unlink(filePath, ...)` block inside DELETE handler with:
    ```js
    if (item.type === 'file' && item.filename) {
      bucket.file(item.filename).delete().catch((err) => {
        console.error('[Delete] Firebase delete error:', err.message);
      });
    }
    ```
    Remove the `const filePath = path.join(...)` and `fs.unlink(...)` lines from this handler.

    **Step B — Update cleanup scheduler:**

    Replace the `fs.unlink(filePath, ...)` block inside the setInterval callback with:
    ```js
    if (item.type === 'file' && item.filename) {
      bucket.file(item.filename).delete().catch((err) => {
        if (err.code !== 404) console.error('[Cleanup] Firebase delete error:', err.message);
      });
    }
    ```
    Remove the `const filePath = path.join(UPLOADS_DIR, item.filename)` line from the scheduler.

    **Step C — Remove all remaining local fs/path references:**

    After A and B, scan server.js for any remaining references to:
    - `UPLOADS_DIR` — remove the constant declaration and any usage
    - `fs.mkdirSync` — already removed in Plan 01, confirm gone
    - `fs.unlink` — confirm gone
    - `fs.existsSync` — confirm gone
    - `import fs from 'node:fs'` — remove this import line entirely
    - `path.join(__dirname, 'uploads')` — remove if present

    Keep `import path from 'node:path'` — still needed for `path.extname()` in upload handler.
    Keep `import { fileURLToPath } from 'node:url'` and `__dirname` — still needed for `express.static(path.join(__dirname, 'public'))`.
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('server.js','utf8'); const bad = ['fs.unlink','UPLOADS_DIR','fs.existsSync','fs.mkdirSync']; const found = bad.filter(b => s.includes(b)); if(found.length) { console.error('Still has:', found); process.exit(1); } console.log('no local fs references remain ok');"</automated>
  </verify>
  <done>DELETE handler uses bucket.file().delete(). Cleanup scheduler uses bucket.file().delete(). No UPLOADS_DIR, no fs.unlink, no fs.existsSync, no fs import remains. server.js is clean of all local disk file I/O.</done>
</task>

</tasks>

<verification>
Run these checks sequentially:
```
node -e "const s = require('fs').readFileSync('server.js','utf8'); ['fs.unlink','UPLOADS_DIR','fs.existsSync','diskStorage'].forEach(b => { if(s.includes(b)) { console.error('FAIL: found',b); process.exit(1); }}); console.log('PASS: no local disk references');"
node -e "const s = require('fs').readFileSync('server.js','utf8'); ['createReadStream','bucket.file','firebase-admin'].forEach(b => { if(!s.includes(b)) { console.error('FAIL: missing',b); process.exit(1); }}); console.log('PASS: Firebase references present');"
```
</verification>

<success_criteria>
- GET /api/download/:id streams from Firebase Storage
- DELETE /api/items/:id deletes from Firebase Storage
- Cleanup scheduler deletes expired files from Firebase Storage
- No local disk references (UPLOADS_DIR, fs.unlink, fs.existsSync, diskStorage) remain in server.js
- `import fs` line removed from server.js
</success_criteria>

<output>
After completion, create `.planning/phases/02-firebase/02-firebase-02-SUMMARY.md`
</output>
