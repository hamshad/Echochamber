---
phase: 02-firebase
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - server.js
autonomous: true
requirements: [STORE-01, STORE-04]
user_setup:
  - service: firebase
    why: "Cloud file storage — replaces local uploads/ directory"
    env_vars:
      - name: FIREBASE_SERVICE_ACCOUNT
        source: "Firebase Console → Project Settings → Service Accounts → Generate new private key → copy entire JSON content as a single-line string"
      - name: FIREBASE_STORAGE_BUCKET
        source: "Firebase Console → Storage → get the bucket name shown (e.g. your-project-id.firebasestorage.app)"
    dashboard_config:
      - task: "Set Storage rules to public (allow read, write: if true)"
        location: "Firebase Console → Storage → Rules tab"

must_haves:
  truths:
    - "Server starts without creating uploads/ directory"
    - "POST /api/upload receives a file, stores it in Firebase Storage, returns item JSON"
    - "Firebase bucket object exists after upload"
  artifacts:
    - path: "server.js"
      provides: "Firebase Admin SDK initialization + multer memoryStorage + upload to Firebase"
      contains: "initializeApp"
    - path: "package.json"
      provides: "firebase-admin dependency"
      contains: "firebase-admin"
  key_links:
    - from: "POST /api/upload"
      to: "Firebase Storage bucket"
      via: "bucket.file(filename).save(req.file.buffer)"
      pattern: "bucket\\.file.*\\.save"
---

<objective>
Add Firebase Admin SDK to the project and swap file uploads from local disk storage to Firebase Storage.

Purpose: Vercel's serverless filesystem is read-only — local disk uploads fail at runtime. Firebase Storage is the minimal change that makes file storage work on Vercel without changing any other part of the app.

Output:
- package.json with firebase-admin added
- server.js with Firebase initialized, multer switched to memoryStorage, upload buffer saved to Firebase Storage on POST /api/upload
</objective>

<execution_context>
@/Users/moksha/.config/opencode/get-shit-done/workflows/execute-plan.md
@/Users/moksha/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@server.js
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add firebase-admin dependency and initialize Firebase bucket</name>
  <files>package.json, server.js</files>
  <action>
    1. Run `npm install firebase-admin` to add it to package.json.

    2. In server.js, add these imports near the top (after existing imports):
       ```js
       import { initializeApp, cert } from 'firebase-admin/app';
       import { getStorage } from 'firebase-admin/storage';
       ```

    3. Remove the UPLOADS_DIR constant and the entire mkdirSync block (lines 17-26 approx). Replace with Firebase initialization:
       ```js
       const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
       const bucketName = process.env.FIREBASE_STORAGE_BUCKET || '';
       initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName });
       const bucket = getStorage().bucket();
       ```

    4. Swap multer diskStorage for memoryStorage. Replace the `const storage = multer.diskStorage(...)` block and `const upload = multer({ storage })` with:
       ```js
       const upload = multer({ storage: multer.memoryStorage() });
       ```

    5. Remove the `import fs from 'node:fs'` line ONLY if fs is no longer used anywhere else in the file. At this stage, fs is still used in GET /api/download and DELETE and cleanup — so leave it for now (it will be removed in Plan 02).

    Note: Do NOT yet change GET /api/download, DELETE /api/items/:id, or the cleanup scheduler — those are Plan 02.
  </action>
  <verify>
    <automated>node --input-type=module &lt;&lt;&lt; "import { initializeApp } from 'firebase-admin/app'; console.log('firebase-admin import ok')"</automated>
    <manual>Check package.json contains "firebase-admin" in dependencies</manual>
  </verify>
  <done>firebase-admin is in package.json dependencies. server.js imports initializeApp and getStorage. multer uses memoryStorage. Firebase is initialized from env vars.</done>
</task>

<task type="auto">
  <name>Task 2: Upload file buffer to Firebase Storage in POST /api/upload</name>
  <files>server.js</files>
  <action>
    Replace the POST /api/upload handler body. Currently it uses `req.file.filename` (the disk path multer wrote). After this change, multer gives us `req.file.buffer` (in-memory). We must upload that buffer to Firebase Storage ourselves.

    New handler (replace the entire `app.post('/api/upload', ...)` block):
    ```js
    app.post('/api/upload', upload.single('file'), async (req, res) => {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file provided' });

      const id = uuidv4();
      const ext = path.extname(file.originalname);
      const storageName = id + ext;

      try {
        const fileRef = bucket.file(storageName);
        await fileRef.save(file.buffer, {
          metadata: { contentType: file.mimetype }
        });
      } catch (err) {
        console.error('[Upload] Firebase Storage error:', err.message);
        return res.status(500).json({ error: 'Storage upload failed' });
      }

      const now = Date.now();
      const item = {
        id,
        type: 'file',
        content: null,
        filename: storageName,       // Firebase Storage object name
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
    ```

    Key points:
    - Handler is now `async` because `fileRef.save()` returns a Promise
    - `storageName` is the Firebase Storage object key (uuid + extension)
    - `item.filename` stores the Firebase object name (not a local path)
    - Error handling returns 500 if Firebase upload fails
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('server.js','utf8'); if(!s.includes('fileRef.save')) { process.exit(1); } console.log('upload handler updated ok');"</automated>
    <manual>Visually confirm POST /api/upload handler is async and calls bucket.file().save()</manual>
  </verify>
  <done>POST /api/upload is async, uploads req.file.buffer to Firebase Storage bucket using bucket.file(storageName).save(), stores storageName in item.filename, returns 201 with item JSON.</done>
</task>

</tasks>

<verification>
- `npm ls firebase-admin` shows firebase-admin installed
- server.js contains `initializeApp`, `getStorage`, `multer.memoryStorage()`, `fileRef.save`
- No multer diskStorage reference remains in server.js
- UPLOADS_DIR and mkdirSync block removed
</verification>

<success_criteria>
- firebase-admin in package.json
- server.js initializes Firebase from env vars FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET
- POST /api/upload uploads file buffer to Firebase Storage and returns item with Firebase object name as filename
- App still starts locally (Firebase init will warn if env vars missing, but won't crash on startup)
</success_criteria>

<output>
After completion, create `.planning/phases/02-firebase/02-firebase-01-SUMMARY.md`
</output>
