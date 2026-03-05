# Project State

## Current Phase
Phase 1: Core Application — Planning

## Decisions
- **Local server** (not Vercel) — true network isolation, data never leaves LAN
- **Express + Socket.IO + vanilla frontend** — minimal dependencies, zero build step
- **In-memory Map + disk storage** — no database needed for ephemeral data
- **1 hour auto-cleanup TTL** — content expires and is deleted automatically
- **4 total dependencies:** express, socket.io, multer, uuid
- **Real-time updates** via Socket.IO — items appear instantly on all connected devices
- **Drag-drop zone** — full-screen drop zone for file uploads

## Blockers
None
