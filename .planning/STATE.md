# Project State

## Current Phase
Phase 2: Firebase Storage Migration — Ready to execute (blocked on Firebase credentials from user)

## Decisions
- **Vercel deployment** — app will be deployed on Vercel, not self-hosted
- **Firebase Storage** — replaces local disk for file storage (Vercel has read-only filesystem)
- **Public IP as room key** — server-side detection of client public IP via x-forwarded-for, used to scope all items and Socket.IO rooms automatically — zero user friction
- **No auth, no pins, no passphrases** — security through public IP scoping only; data is ephemeral (1hr TTL)
- **Express + Socket.IO + vanilla frontend** — minimal dependencies, zero build step
- **In-memory Map + Firebase Storage** — metadata in memory, files in Firebase
- **1 hour auto-cleanup TTL** — content expires and is deleted automatically
- **5 total dependencies:** express, socket.io, multer, uuid, firebase-admin
- **Real-time updates** via Socket.IO rooms — events scoped to public IP room
- **Drag-drop zone** — full-screen drop zone for file uploads

## Completed Phases
- Phase 1: Core Application ✅ — server.js, public/index.html, public/style.css, public/app.js

## Blockers
- **Waiting on Firebase credentials from user** before Phase 2 can execute:
  1. Firebase service account JSON (downloaded from Firebase Console)
  2. Firebase Storage bucket name (e.g. `your-project-id.firebasestorage.app`)
  3. Firebase Storage rules set to open (allow read, write: if true)

- **URL detection and YouTube playback** — added redirect buttons for all URLs and play buttons for YouTube videos in shared text items.
