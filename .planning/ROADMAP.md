# Echochamber — Project Roadmap

## Vision
A file and text sharing application — deployable on Vercel but with automatic network-based room isolation. Open the app, share files or text, and only people behind the same router (same public IP) see your items. No accounts, no login, no pins, no passphrases. Everything auto-cleans after 1 hour.

## Architecture
- **Runtime:** Node.js
- **Server:** Express.js + Socket.IO
- **Frontend:** Vanilla HTML5/CSS3/JavaScript (no build step)
- **Storage:** In-memory Map (metadata) + Firebase Storage (files), 1-hour TTL
- **Room isolation:** Public IP address used as automatic room key (server-side detection)
- **Dependencies:** express, socket.io, multer, uuid, firebase-admin
- **Deployment:** Vercel (serverless function for server.js, static for public/)

## Requirements

### Phase 1 (Completed)
- SHARE-01: Users can share text snippets visible to all connected devices
- SHARE-02: Users can share files of any type and any size, downloadable by all
- RT-01: New shares appear in real-time on all connected devices without page refresh
- CLEAN-01: All shared items auto-delete after 1 hour
- UI-01: Full-screen drag-drop zone for file uploads with visual feedback
- UI-02: Clean, modern single-page interface (dark theme)
- NET-01: Server prints shareable local network URL on startup

### Phase 2 (Firebase Storage Migration)
- STORE-01: File uploads stored in Firebase Storage (not local disk)
- STORE-02: File downloads streamed from Firebase Storage
- STORE-03: File deletes (manual + TTL cleanup) remove from Firebase Storage
- STORE-04: No local uploads/ directory dependency — works on Vercel serverless filesystem

### Phase 3 (Public IP Room Scoping)
- ROOM-01: Each client's public IP is detected server-side on every API request
- ROOM-02: All items (text + files) are scoped to the public IP that created them
- ROOM-03: Socket.IO rooms are keyed by public IP — real-time events only broadcast within the same room
- ROOM-04: GET /api/items only returns items belonging to the requester's public IP
- ROOM-05: TTL cleanup emits socket events only to the relevant room

### Phase 4 (Vercel Deployment)
- DEPLOY-01: vercel.json routes /api/* and /socket.io/* through server.js as serverless function
- DEPLOY-02: vercel.json serves public/ as static files
- DEPLOY-03: Firebase credentials injected via Vercel environment variables (FIREBASE_SERVICE_ACCOUNT + FIREBASE_STORAGE_BUCKET)
- DEPLOY-04: App is fully functional after `vercel --prod` deploy

---

### Phase 1: Core Application ✅ COMPLETE
**Goal:** Complete working local application — server with API and disk storage, beautiful single-page UI with drag-drop and real-time sync, 1-hour auto-cleanup
**Requirements:** [SHARE-01, SHARE-02, RT-01, CLEAN-01, UI-01, UI-02, NET-01]
**Plans:** 2/2 plans complete

Plans:
- [x] 01-core-app-01-PLAN.md — Backend server with API, file storage, cleanup scheduler
- [x] 01-core-app-02-PLAN.md — Frontend SPA with drag-drop, real-time updates, download

---

### Phase 2: Firebase Storage Migration
**Goal:** Replace local disk storage with Firebase Storage so the app works on Vercel's read-only serverless filesystem — multer switches to memory buffer, all file I/O goes through Firebase Admin SDK
**Requirements:** [STORE-01, STORE-02, STORE-03, STORE-04]
**Plans:** 2 plans

Plans:
- [ ] 02-firebase-01-PLAN.md — Add firebase-admin, initialize bucket, swap multer to memoryStorage, upload buffer to Firebase on POST /api/upload
- [ ] 02-firebase-02-PLAN.md — Stream download from Firebase on GET /api/download/:id, delete from Firebase on DELETE /api/items/:id and in cleanup scheduler, remove all local fs/uploads references

---

### Phase 3: Public IP Room Scoping
**Goal:** Automatically isolate shared items by public IP so only people on the same network (behind the same router) see each other's content — zero friction, no user action required
**Requirements:** [ROOM-01, ROOM-02, ROOM-03, ROOM-04, ROOM-05]
**Plans:** 2 plans

Plans:
- [ ] 03-rooms-01-PLAN.md — Server-side public IP extraction middleware (from x-forwarded-for / req.ip), add roomId field to all items, scope items Map queries by roomId, scope all API responses
- [ ] 03-rooms-02-PLAN.md — Socket.IO room join by public IP on connection, scope item:added / item:removed / items:sync to room only, scope cleanup scheduler broadcasts to room

---

### Phase 4: Vercel Deployment
**Goal:** Wire vercel.json so the full app (static frontend + Express API + Socket.IO) deploys and runs correctly on Vercel with Firebase credentials as environment variables
**Requirements:** [DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04]
**Plans:** 1 plan

Plans:
- [ ] 04-deploy-01-PLAN.md — vercel.json routing for API + static, FIREBASE_SERVICE_ACCOUNT + FIREBASE_STORAGE_BUCKET env vars, remove DISABLE_UPLOAD_DIR guard, end-to-end deploy verification
