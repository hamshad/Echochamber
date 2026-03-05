# Echochamber

## What
Local-network file and text sharing app. Share anything with anyone on the same WiFi — no cloud, no accounts, no third parties.

## Why
Confidential data sharing between trusted people on the same network. No data leaves the local network. Person A drops a file or pastes text, closes the browser. Person B opens the app minutes later and sees everything shared.

## How
Single Node.js server running on one machine. Others connect via the machine's local IP address (e.g. `http://192.168.1.42:3000`). Files stored on disk, metadata in memory, everything auto-cleans after 1 hour.

## Stack
- **Runtime:** Node.js
- **Server:** Express.js
- **Real-time:** Socket.IO
- **File uploads:** multer
- **Frontend:** Vanilla HTML5 + CSS3 + JavaScript (no framework, no build step)
- **Storage:** In-memory Map (metadata) + disk (files) — zero database
- **Dependencies:** express, socket.io, multer, uuid (4 total)

## Non-Goals
- No authentication (network isolation IS the security model)
- No cloud deployment (runs locally only)
- No database (in-memory + disk is sufficient for ephemeral data)
- No build step (vanilla frontend, served as static files)
