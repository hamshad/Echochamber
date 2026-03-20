# 📡 Echochamber

> **Instantly share text and files with anyone on your local network.**

Echochamber is a lightweight bridge for your WiFi. Drop a snippet, upload a file, and it's immediately available to every device in the room.

### ✨ Features
- **Zero Config** — Automatic room discovery via network IP.
- **Ephemeral** — Items live for 1 hour, then vanish forever.
- **Private** — No accounts, no tracking, just your local network.
- **Realtime** — Instant sync powered by Firebase.

### 🚀 Launch
```bash
npm install
npm start
```

### 🔧 Configuration
The application is configured via environment variables. Copy `.env.example` to `.env` and fill in the values, or set them directly in your hosting platform (e.g., Vercel).

**Required variables**
- `FIREBASE_SERVICE_ACCOUNT` – Full service account JSON as a single-line string (recommended for Vercel)  
  OR `FIREBASE_SERVICE_ACCOUNT_PATH` – Path to a local service account JSON file (for development).
- `FIREBASE_STORAGE_BUCKET` – Your Firebase Storage bucket name (e.g., `your-project-id.firebasestorage.app`).
- `FIREBASE_DATABASE_URL` – Your Firebase Realtime Database URL (e.g., `https://your-project-id-default-rtdb.firebaseio.com`).

**Optional variables**
- `TTL_MS` – Time-to-live for items in milliseconds (default: `3600000` = 1 hour).
- `CLEANUP_INTERVAL_MS` – How often the cleanup routine runs in milliseconds (default: `60000` = 60 seconds).
- `PORT` – Port to run the server on (default: `3000`).

*Configure using `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_DATABASE_URL`.*

---
[MIT License](./LICENSE) • [Contributing](./CONTRIBUTING.md)
