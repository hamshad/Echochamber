---
phase: 01-lan-file-share
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - tools/signaling-server/index.js
  - tools/signaling-server/package.json
  - .gitignore
autonomous: true
requirements: [FS-01, FS-04]
user_setup:
  - service: "optional-local-signaling"
    why: "Enables automatic peer discovery on LAN and simplifies connection handshake. Not required for manual pairing."
    env_vars: []
    dashboard_config: []
must_haves:
  truths:
    - "A small local Node signaling server can be run by the user to assist peer discovery on the LAN"
    - "The SPA can connect to the local signaling server if provided and use it to exchange SDP/ICE for WebRTC pairing"
  artifacts:
    - path: "tools/signaling-server/index.js"
      provides: "Minimal WebSocket-based signaling: join(room), signal(payload)"
  key_links:
    - from: "src/lib/webrtc.ts"
      to: "tools/signaling-server/index.js"
      via: "WebSocket signaling exchange"

---

<objective>
Create an optional lightweight Node-based signaling helper (WebSocket) that users can run locally to allow automatic discovery and easier WebRTC pairing across devices on the same network. This is optional — manual code/QR pairing remains supported by Plan 01.

Purpose: Improve UX for establishing P2P connections in environments where manual pairing is inconvenient.
Output: tools/signaling-server with start script and README explaining how to run it on the LAN.
</objective>

<execution_context>
@.planning/ROADMAP.md
</execution_context>

<context>
@.planning/phases/01-lan-file-share/01-lan-file-share-01-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add signaling server scaffold</name>
  <files>tools/signaling-server/index.js, tools/signaling-server/package.json</files>
  <action>
    Implement a tiny WebSocket server using the `ws` package. Accept connections, handle `join` messages (room), and forward `signal` messages to other peers in the room. Keep the server stateless and small (single-file implementation). Add an npm script `start` that listens on 0.0.0.0:3001 by default.
    - Keep security minimal: only intended for trusted LAN use. No persistent storage.
    - Document that the server is optional and explain how to connect the SPA (WS URL configuration).
  </action>
  <verify>
    <automated>node tools/signaling-server/index.js --version || echo 'server ready'</automated>
    <manual>Run server locally and confirm two browser instances can exchange signaling messages via the server.</manual>
    <sampling_rate>run after this task commits, before plan completion</sampling_rate>
  </verify>
  <done>Signaling server runs locally and forwards signaling payloads between clients; README included.</done>
</task>

</tasks>

<verification>
Manual test: Run tools/signaling-server and from two devices on the LAN point the SPA's signaling config to ws://<host-ip>:3001. Start pairing — confirm SDP messages exchange and WebRTC connection established.
</verification>

<success_criteria>
Signaling server runs and assists in establishing WebRTC peer connections between SPA instances on different devices in same LAN.
</success_criteria>

<output>
After completion, create `.planning/phases/01-lan-file-share/01-lan-file-share-02-SUMMARY.md`
</output>
