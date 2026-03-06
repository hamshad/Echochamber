Vercel configuration and deployment notes for Echochamber

Summary
-------
This repository contains a local-network Node.js server (server.js) and a static single-page frontend (public/).

Important security note
-----------------------
- The original design for Echochamber assumes a local server (LAN-only) to keep shares private between devices on the same WiFi. Deploying the app to Vercel will host it publicly and will change the security model. Be sure you understand the privacy implications before deploying the backend publicly.

What this config does
---------------------
- vercel.json builds two types of artifacts:
  - api/**/*.js → handled by @vercel/node serverless functions
  - public/**/* → served as static frontend files
- Routes map /api/* to serverless functions and all other routes to public/index.html (SPA fallback)

Notes & required changes before deploying backend on Vercel
---------------------------------------------------------
1. server.js is a long-running Express server that `listen()`s on a port and uses the filesystem (uploads/). That pattern is NOT compatible with Vercel serverless functions. To deploy the backend on Vercel you must:
   - Split server.js into modular serverless handlers under the `api/` directory (e.g. api/items.js, api/upload.js, api/download/[id].js).
   - Replace filesystem-backed uploads with external storage (S3-compatible or Vercel Blob) because serverless instances have ephemeral storage and limited execution time.
   - Rework realtime (Socket.IO) to a supported approach (e.g., a 3rd-party real-time provider) — Vercel serverless does not support persistent WebSocket servers.
   
   Quick compatibility layer (what we added):
   - The server now skips creating `uploads/` if the environment variable `DISABLE_UPLOAD_DIR=true` is set during startup. This prevents a hard failure when Vercel attempts to import server.js in a read-only environment. However, skipping local uploads means file uploads will fail at runtime unless you implement remote storage or enable the directory.

2. Recommended safer option (preserves privacy):
   - Deploy only the frontend to Vercel (static files in public/). Keep the Express server running on your local machine or a LAN host. Configure the frontend to talk to the local server (use the LAN IP). This keeps the confidentiality model intact while still hosting the UI on Vercel.

How to deploy the frontend-only (quick, recommended)
------------------------------------------------
1. Ensure `public/index.html` + `public/*` contain your production-ready frontend.
2. Push to GitHub and connect the repository to Vercel.
3. In Vercel Project Settings → General → Build & Output Settings, set:
   - Framework Preset: Other
   - Build Command: (empty)
   - Output Directory: public
4. Deploy. The static app will be served at https://<your-vercel-app>.vercel.app

How to deploy the full app (advanced — refactor required)
------------------------------------------------------
1. Refactor the backend into serverless functions in `api/`.
2. Move uploads to a persistent storage backend; add necessary environment variables in Vercel (S3 keys, etc.).
3. Remove Socket.IO or replace realtime with a supported service.
4. Configure vercel.json if you need custom routes or rewrites.

Environment variables & secrets
------------------------------
- If you deploy any serverless functions that require secrets (S3 keys, API keys), add them in Vercel Dashboard → Settings → Environment Variables.
- Do NOT commit secrets to the repository.

CI / GitHub Actions
-------------------
- Vercel integrates directly with GitHub; when connected it will deploy on push. No additional GitHub Action is required unless you want to run tests before deploy. If desired, add a simple workflow that runs `npm ci` and `npm test` on push to main.

Questions
---------
- Do you want me to:
  - Add API serverless function stubs under `api/` (I can scaffold handlers that mirror the current Express endpoints)?
  - Or keep the Express backend local and configure the frontend for Vercel-only deployment (recommended for privacy)?
