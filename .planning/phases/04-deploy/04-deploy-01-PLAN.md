---
phase: 04-deploy
plan: 01
type: execute
wave: 1
depends_on: [03-rooms-02]
files_modified:
  - vercel.json
  - server.js
autonomous: false
requirements: [DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04]

must_haves:
  truths:
    - "vercel.json routes /api/* requests to server.js"
    - "vercel.json routes /socket.io/* requests to server.js"
    - "vercel.json serves public/ as static files"
    - "Firebase credentials are read from FIREBASE_SERVICE_ACCOUNT and FIREBASE_STORAGE_BUCKET env vars"
    - "App loads in browser after vercel --prod deploy"
    - "Two browser tabs on the same network share items in real-time after deploy"
  artifacts:
    - path: "vercel.json"
      provides: "Vercel routing config"
      contains: "api"
    - path: "server.js"
      provides: "Clean serverless-compatible entry point"
  key_links:
    - from: "vercel.json"
      to: "server.js"
      via: "builds + routes config"
      pattern: "server\\.js"
    - from: "server.js"
      to: "process.env.FIREBASE_SERVICE_ACCOUNT"
      via: "JSON.parse at init"
      pattern: "FIREBASE_SERVICE_ACCOUNT"
---

<objective>
Wire vercel.json to route all API and Socket.IO traffic through server.js as a Vercel serverless function, serve public/ as static, and verify the full deployment works end-to-end.

Purpose: The previous vercel.json only served static files — it had no routing to server.js at all. This is the final piece that makes the Vercel deployment actually functional.

Output:
- vercel.json with correct builds and routes
- server.js with DISABLE_UPLOAD_DIR guard removed (no longer needed)
- Verified working Vercel deployment
</objective>

<execution_context>
@/Users/moksha/.config/opencode/get-shit-done/workflows/execute-plan.md
@/Users/moksha/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@vercel.json
@server.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update vercel.json routing and clean up server.js</name>
  <files>vercel.json, server.js</files>
  <action>
    **Step A — Rewrite vercel.json:**

    Replace the entire file with:
    ```json
    {
      "version": 2,
      "builds": [
        { "src": "server.js", "use": "@vercel/node" },
        { "src": "public/**", "use": "@vercel/static" }
      ],
      "routes": [
        { "src": "/socket.io/(.*)", "dest": "/server.js" },
        { "src": "/api/(.*)", "dest": "/server.js" },
        { "src": "/(.*\\.(css|js|html|ico|png|jpg|svg|woff2?))", "dest": "/public/$1" },
        { "src": "/(.*)", "dest": "/public/index.html" }
      ]
    }
    ```

    Route order matters:
    1. Socket.IO traffic → server.js (must be first — highest priority)
    2. API traffic → server.js
    3. Static assets → public/ (explicit extensions)
    4. Everything else → public/index.html (SPA fallback)

    **Step B — Clean up server.js:**

    Remove the `DISABLE_UPLOAD_DIR` env guard and its surrounding try/catch block entirely. After Firebase migration (Phase 02), there is no uploads directory to create — this guard is dead code. Also remove the line `fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });` — Vercel serves public/ as static, no need to create it at runtime.

    The startup section of server.js should now go straight from imports to `const items = new Map();` with just the Firebase init block in between.

    **Step C — Verify FIREBASE_SERVICE_ACCOUNT parsing is safe:**

    Confirm the Firebase init block in server.js handles missing env vars gracefully (for local dev without Firebase):
    ```js
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || '';
    ```
    This already handles the empty case — Firebase Admin will warn but not crash at init time. File operations will fail gracefully at request time. No change needed if already correct.
  </action>
  <verify>
    <automated>node -e "const v = JSON.parse(require('fs').readFileSync('vercel.json','utf8')); const hasServerBuild = v.builds.some(b => b.src === 'server.js'); const hasSocketRoute = v.routes.some(r => r.src.includes('socket.io')); const hasApiRoute = v.routes.some(r => r.src.includes('api')); if(!hasServerBuild || !hasSocketRoute || !hasApiRoute) { console.error('FAIL vercel.json check'); process.exit(1); } console.log('PASS: vercel.json routes ok');"</automated>
  </verify>
  <done>vercel.json builds server.js with @vercel/node and routes /socket.io/* and /api/* to it. public/ is served as static. DISABLE_UPLOAD_DIR guard removed from server.js.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Full Vercel deployment with Firebase Storage + public IP room scoping.
    Claude will run `vercel --prod` and provide the deployment URL.
  </what-built>
  <how-to-verify>
    1. Open the Vercel deployment URL in two browser tabs (same machine = same public IP = same room)
    2. In Tab A: paste some text and click "Share Text" — it should appear in Tab B instantly
    3. In Tab B: drag a file onto the page — it should appear in Tab A with a Download button
    4. Click Download in Tab A — file should download correctly
    5. Click Delete on any item — it should disappear from both tabs
    6. Wait or note: items have a 1-hour countdown timer visible on each card
    7. Open the URL on your phone (same WiFi) — you should see the same items
    8. Open the URL on a friend's network (different WiFi) — they should see an empty room
  </how-to-verify>
  <resume-signal>Type "approved" if everything works, or describe what's broken</resume-signal>
</task>

</tasks>

<verification>
Before running vercel --prod, run local checks:
```
node -e "const v = JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('routes:', JSON.stringify(v.routes, null, 2));"
node -e "const s = require('fs').readFileSync('server.js','utf8'); if(s.includes('DISABLE_UPLOAD_DIR')) { console.error('FAIL: old guard still present'); process.exit(1); } console.log('PASS: server.js clean');"
```
</verification>

<success_criteria>
- vercel.json routes socket.io and api traffic to server.js
- vercel.json serves public/ statically
- server.js has no DISABLE_UPLOAD_DIR guard or mkdirSync for uploads
- `vercel --prod` deploys without error
- Two tabs on the same network share items in real-time on the live Vercel URL
- Tabs on different networks cannot see each other's items
</success_criteria>

<output>
After completion, create `.planning/phases/04-deploy/04-deploy-01-SUMMARY.md`
</output>
