Echochamber
============

Lightweight local network file & text sharing service backed by Firebase Storage and Realtime Database.

Key points
- Share text snippets or files with devices on the same network.
- Items auto-expire (default 1 hour) and are cleaned from storage and DB.
- Small, self-hostable Node.js app (Express + Firebase Admin).

Quick start (self-host)
1. Requirements: Node.js 18+ and a Firebase project with Storage + Realtime Database enabled.
2. Install dependencies:
   ```
   npm install
   ```
3. Provide Firebase credentials either by setting the `FIREBASE_SERVICE_ACCOUNT` env var to the service account JSON string, or by placing a service account JSON file in the project root (filename matching `*-firebase-adminsdk-*.json`).
4. Required env vars:
   - `FIREBASE_DATABASE_URL` — your Realtime Database URL (eg. `https://<project>.firebaseio.com`)
   - `FIREBASE_STORAGE_BUCKET` — your Storage bucket name (optional; there's a sensible default)
   - `PORT` — port to run the server (defaults to `3000`)
   - `TTL_MS` — (optional) item lifetime in milliseconds (default: 3600000)
5. Start the server:
   ```
   npm start
   ```
6. Open `http://localhost:3000` or the printed network URL and share with other devices on the same network.

API (useful for automation / integrations)
- `GET /api/items` — list active items for your IP room
- `POST /api/text` — create a text item (JSON body: `{ "content": "..." }`)
- `POST /api/upload` — upload a file (multipart form `file` field)
- `GET /api/download/:id` — download a file item
- `DELETE /api/items/:id` — delete an item you created
- `GET /api/cleanup` — trigger cleanup (intended for cron jobs)

Self-hosting notes
- Service account: generate a Firebase service account JSON from the Firebase console → Project Settings → Service accounts → "Generate new private key". Either export it into `FIREBASE_SERVICE_ACCOUNT` or save the JSON in the repo root.
- Database rules: configure Realtime Database rules to allow the app to read/write `items` (server uses admin SDK so service account controls access).
- Cron: for periodic cleanup you can call `/api/cleanup` from an external scheduler (cron, GitHub Actions, or platform cron). Optionally protect it with your own secret header.

Tests
- Unit & integration tests are runnable via `npm test` (the project includes a few test entries).

License & contributing
- This project is open source under the MIT License — see `LICENSE`.
- See `CONTRIBUTING.md` for contribution guidelines.

If something is unclear or you hit issues while self-hosting, open an issue with reproduction steps and logs.
