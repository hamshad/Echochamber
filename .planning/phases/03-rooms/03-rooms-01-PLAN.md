---
phase: 03-rooms
plan: 01
type: execute
wave: 1
depends_on: [02-firebase-02]
files_modified:
  - server.js
autonomous: true
requirements: [ROOM-01, ROOM-02, ROOM-04]

must_haves:
  truths:
    - "Every API request has a roomId derived from the client's public IP"
    - "GET /api/items returns only items belonging to the requester's public IP"
    - "POST /api/text and POST /api/upload attach roomId to the created item"
    - "DELETE /api/items/:id only works if the item belongs to the requester's room"
  artifacts:
    - path: "server.js"
      provides: "getRoomId() middleware + roomId on all items + scoped API responses"
      contains: "getRoomId"
  key_links:
    - from: "every API handler"
      to: "getRoomId(req)"
      via: "x-forwarded-for header or req.socket.remoteAddress"
      pattern: "getRoomId"
    - from: "items Map"
      to: "roomId"
      via: "item.roomId stored on creation, filtered on read"
      pattern: "item\\.roomId"
---

<objective>
Add server-side public IP detection and use it as a room key to scope all items. Every item gets a roomId on creation; every read/delete filters by roomId.

Purpose: This is the core isolation mechanism — people on the same router share a public IP, so they naturally see each other's items and no one else's. Zero friction for the user.

Output:
- getRoomId(req) helper that extracts public IP from x-forwarded-for (Vercel sets this) or falls back to req.socket.remoteAddress (local)
- All items created with a roomId field
- GET /api/items filters by roomId
- DELETE /api/items/:id checks roomId match
</objective>

<execution_context>
@/Users/moksha/.config/opencode/get-shit-done/workflows/execute-plan.md
@/Users/moksha/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@server.js
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getRoomId() helper and trust proxy setting</name>
  <files>server.js</files>
  <action>
    **Step A — Trust proxy (required for Vercel/reverse proxies to expose real client IP):**

    Add this line immediately after `const app = express();`:
    ```js
    app.set('trust proxy', true);
    ```

    **Step B — Add getRoomId() helper function:**

    Add this function after the `app.set('trust proxy', true)` line (before any routes):
    ```js
    function getRoomId(req) {
      // On Vercel and other reverse proxies, the real client IP is in x-forwarded-for
      // x-forwarded-for can be a comma-separated list — take the first (original client)
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        const first = forwarded.split(',')[0].trim();
        if (first) return first;
      }
      // Fallback for local development: use direct socket address
      return req.socket?.remoteAddress || 'local';
    }
    ```

    **Why x-forwarded-for:** Vercel's infrastructure sits between the browser and server.js. The browser's actual IP is passed in x-forwarded-for. On local (`npm start`), the header won't be present, so it falls back to the direct socket address — which means everyone on the same machine shares a room when developing locally (correct behavior).
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('server.js','utf8'); if(!s.includes('getRoomId') || !s.includes('x-forwarded-for') || !s.includes('trust proxy')) { process.exit(1); } console.log('getRoomId helper ok');"</automated>
  </verify>
  <done>server.js has `app.set('trust proxy', true)` and a getRoomId(req) function that extracts the public IP from x-forwarded-for or falls back to req.socket.remoteAddress.</done>
</task>

<task type="auto">
  <name>Task 2: Attach roomId to all created items, scope GET and DELETE by roomId</name>
  <files>server.js</files>
  <action>
    **Step A — Update getActiveItems() to accept a roomId filter:**

    Replace the existing `getActiveItems()` function with:
    ```js
    function getActiveItems(roomId) {
      const now = Date.now();
      return Array.from(items.values())
        .filter(i => i.expiresAt > now && i.roomId === roomId)
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    ```

    **Step B — Add roomId to POST /api/text:**

    In the POST /api/text handler, add `const roomId = getRoomId(req);` at the top of the handler, then add `roomId` to the item object:
    ```js
    const item = {
      id,
      type: 'text',
      roomId,          // ← add this
      content,
      filename: null,
      originalName: null,
      mimetype: null,
      size: Buffer.byteLength(content, 'utf8'),
      createdAt: now,
      expiresAt: now + TTL
    };
    ```

    **Step C — Add roomId to POST /api/upload:**

    Same pattern — add `const roomId = getRoomId(req);` at top of handler, add `roomId` to the item object.

    **Step D — Scope GET /api/items:**

    Update the handler to pass roomId:
    ```js
    app.get('/api/items', (req, res) => {
      const roomId = getRoomId(req);
      res.json(getActiveItems(roomId));
    });
    ```

    **Step E — Scope DELETE /api/items/:id:**

    Add a room check so users can't delete other rooms' items:
    ```js
    app.delete('/api/items/:id', (req, res) => {
      const id = req.params.id;
      const item = items.get(id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      const roomId = getRoomId(req);
      if (item.roomId !== roomId) return res.status(403).json({ error: 'Forbidden' });
      // ... rest of delete logic unchanged
    });
    ```
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('server.js','utf8'); const checks = ['item.roomId','getRoomId(req)','getActiveItems(roomId)']; const missing = checks.filter(c => !s.includes(c)); if(missing.length) { console.error('Missing:', missing); process.exit(1); } console.log('roomId scoping ok');"</automated>
  </verify>
  <done>All items have a roomId field. GET /api/items filters by roomId. DELETE /api/items/:id rejects cross-room deletes with 403. getActiveItems() accepts and filters by roomId.</done>
</task>

</tasks>

<verification>
```
node -e "const s = require('fs').readFileSync('server.js','utf8'); ['getRoomId','x-forwarded-for','trust proxy','item.roomId','getActiveItems(roomId)'].forEach(t => { if(!s.includes(t)) { console.error('MISSING:',t); process.exit(1); }}); console.log('PASS: all room scoping checks ok');"
```
</verification>

<success_criteria>
- getRoomId(req) extracts IP from x-forwarded-for or falls back to socket address
- Every item in the Map has a roomId field
- GET /api/items only returns items matching the requester's roomId
- DELETE /api/items/:id returns 403 if item belongs to a different roomId
</success_criteria>

<output>
After completion, create `.planning/phases/03-rooms/03-rooms-01-SUMMARY.md`
</output>
