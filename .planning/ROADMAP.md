# Echochamber — Project Roadmap

## Vision
A local-network file and text sharing application. One person opens the app, drops a file or pastes text, and anyone else on the same WiFi can see it instantly. No accounts, no cloud, no third parties. Everything auto-cleans after 1 hour.

## Architecture
- **Runtime:** Node.js
- **Server:** Express.js + Socket.IO
- **Frontend:** Vanilla HTML5/CSS3/JavaScript (no build step)
- **Storage:** In-memory Map (metadata) + disk (files), 1-hour TTL
- **Dependencies:** express, socket.io, multer, uuid (4 total)

## Requirements
- SHARE-01: Users can share text snippets visible to all connected devices
- SHARE-02: Users can share files of any type and any size, downloadable by all
- RT-01: New shares appear in real-time on all connected devices without page refresh
- CLEAN-01: All shared items auto-delete after 1 hour (files removed from disk)
- UI-01: Full-screen drag-drop zone for file uploads with visual feedback
- UI-02: Clean, modern single-page interface (dark theme)
- NET-01: Server prints shareable local network URL on startup

---

### Phase 1: Core Application
**Goal:** Complete working application — server with API and storage, beautiful single-page UI with drag-drop and real-time sync, 1-hour auto-cleanup
**Requirements:** [SHARE-01, SHARE-02, RT-01, CLEAN-01, UI-01, UI-02, NET-01]
**Plans:** 2 plans

Plans:
- [ ] 01-core-app-01-PLAN.md — Backend server with API, file storage, cleanup scheduler
- [ ] 01-core-app-02-PLAN.md — Frontend SPA with drag-drop, real-time updates, download
