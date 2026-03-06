---
phase: 03-rooms
plan: 02
type: execute
wave: 2
depends_on: [03-rooms-01]
files_modified:
  - server.js
autonomous: true
requirements: [ROOM-03, ROOM-05]

must_haves:
  truths:
    - "When a Socket.IO client connects, it joins a room named after its public IP"
    - "item:added events only broadcast to the room matching the item's roomId"
    - "item:removed events only broadcast to the room matching the item's roomId"
    - "items:sync on connection only sends items belonging to that client's room"
    - "Cleanup scheduler broadcasts items:sync only to the affected room"
  artifacts:
    - path: "server.js"
      provides: "Socket.IO room join on connect + scoped emit for all real-time events"
      contains: "socket.join"
  key_links:
    - from: "Socket.IO connection handler"
      to: "socket.join(roomId)"
      via: "x-forwarded-for from socket.handshake.headers"
      pattern: "socket\\.join"
    - from: "io.emit('item:added')"
      to: "io.to(roomId).emit('item:added')"
      via: "item.roomId"
      pattern: "io\\.to\\(.*\\)\\.emit"
---

<objective>
Scope all Socket.IO real-time events to the client's public IP room. Clients join a Socket.IO room on connect; all broadcasts are targeted to that room only.

Purpose: Without this, all connected clients on all networks would receive each other's real-time updates, bypassing the room isolation added in Plan 01.

Output:
- Socket.IO connection handler reads public IP from handshake headers and calls socket.join(roomId)
- All io.emit() calls replaced with io.to(roomId).emit()
- Cleanup scheduler uses io.to(roomId).emit() per room
</objective>

<execution_context>
@/Users/moksha/.config/opencode/get-shit-done/workflows/execute-plan.md
@/Users/moksha/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/STATE.md
@server.js
@.planning/phases/03-rooms/03-rooms-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Join Socket.IO room on connect, scope items:sync to room</name>
  <files>server.js</files>
  <action>
    Replace the existing `io.on('connection', ...)` handler:

    ```js
    io.on('connection', (socket) => {
      // Extract public IP from Socket.IO handshake headers (same logic as getRoomId for HTTP)
      const forwarded = socket.handshake.headers['x-forwarded-for'];
      const roomId = forwarded
        ? forwarded.split(',')[0].trim()
        : (socket.handshake.address || 'local');

      socket.join(roomId);
      console.log('[Socket.IO] Client connected:', socket.id, '→ room:', roomId);

      // Only send items belonging to this room
      socket.emit('items:sync', getActiveItems(roomId));
    });
    ```

    Note: We do NOT reuse `getRoomId(req)` here because Socket.IO connections have `socket.handshake` not `req`. The logic is identical — just different source object.
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('server.js','utf8'); if(!s.includes('socket.join(roomId)') || !s.includes('getActiveItems(roomId)')) { process.exit(1); } console.log('socket room join ok');"</automated>
  </verify>
  <done>Socket.IO connection handler joins the client to a room named after their public IP. items:sync emits only that room's items to the connecting client.</done>
</task>

<task type="auto">
  <name>Task 2: Scope all io.emit() broadcasts to room — item:added, item:removed, cleanup</name>
  <files>server.js</files>
  <action>
    Replace every `io.emit(...)` broadcast with a targeted `io.to(roomId).emit(...)`.

    **In POST /api/text handler** — item has roomId from Plan 01:
    ```js
    io.to(item.roomId).emit('item:added', item);
    ```

    **In POST /api/upload handler** — item has roomId from Plan 01:
    ```js
    io.to(item.roomId).emit('item:added', item);
    ```

    **In DELETE /api/items/:id handler:**
    ```js
    io.to(item.roomId).emit('item:removed', { id });
    ```

    **In the cleanup scheduler setInterval:**

    The cleanup scheduler currently does a single `io.emit('items:sync', getActiveItems())` at the end. We need to broadcast to each affected room individually. Replace the end of the cleanup block:

    ```js
    if (cleaned > 0) {
      console.log(`[Cleanup] Removed ${cleaned} expired item(s)`);
      // Broadcast updated items:sync to each affected room
      for (const roomId of affectedRooms) {
        io.to(roomId).emit('items:sync', getActiveItems(roomId));
      }
    }
    ```

    To collect affectedRooms, add this before the cleanup loop:
    ```js
    const affectedRooms = new Set();
    ```
    And inside the loop when an item is deleted:
    ```js
    affectedRooms.add(item.roomId);
    items.delete(id);
    cleaned++;
    ```

    Final cleanup scheduler should look like:
    ```js
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      const affectedRooms = new Set();
      for (const [id, item] of items) {
        if (now > item.expiresAt) {
          if (item.type === 'file' && item.filename) {
            bucket.file(item.filename).delete().catch((err) => {
              if (err.code !== 404) console.error('[Cleanup] Firebase delete error:', err.message);
            });
          }
          affectedRooms.add(item.roomId);
          items.delete(id);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        console.log(`[Cleanup] Removed ${cleaned} expired item(s)`);
        for (const roomId of affectedRooms) {
          io.to(roomId).emit('items:sync', getActiveItems(roomId));
        }
      }
    }, CLEANUP_INTERVAL);
    ```

    After all changes, confirm zero bare `io.emit(` calls remain (all should be `io.to(`).
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('server.js','utf8'); const bareEmit = (s.match(/io\.emit\(/g) || []); if(bareEmit.length > 0) { console.error('FAIL: bare io.emit() found, should be io.to().emit()'); process.exit(1); } console.log('PASS: all emits are scoped to rooms');"</automated>
  </verify>
  <done>All io.emit() calls replaced with io.to(roomId).emit(). Cleanup scheduler collects affected rooms and broadcasts items:sync per room. No global broadcasts remain.</done>
</task>

</tasks>

<verification>
```
node -e "const s = require('fs').readFileSync('server.js','utf8'); const checks = { 'socket.join(roomId)': true, 'io.to(': true, 'affectedRooms': true }; Object.entries(checks).forEach(([k,v]) => { if(s.includes(k) !== v) { console.error('FAIL check:', k); process.exit(1); }}); if((s.match(/io\.emit\(/g)||[]).length > 0) { console.error('FAIL: bare io.emit found'); process.exit(1); } console.log('PASS: Socket.IO room scoping complete');"
```
</verification>

<success_criteria>
- Socket.IO clients join a room named after their public IP on connection
- items:sync on connect only sends that room's items
- item:added, item:removed, items:sync (cleanup) all use io.to(roomId).emit()
- No bare io.emit() calls remain in server.js
- Two clients on different public IPs cannot see each other's items in real-time
</success_criteria>

<output>
After completion, create `.planning/phases/03-rooms/03-rooms-02-SUMMARY.md`
</output>
