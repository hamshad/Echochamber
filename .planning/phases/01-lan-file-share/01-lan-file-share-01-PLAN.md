---
phase: 01-lan-file-share
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - vite.config.ts
  - index.html
  - src/main.ts
  - src/App.svelte
  - src/components/TextShare.svelte
  - src/components/FileShare.svelte
  - src/lib/webrtc.ts
  - src/lib/ttl.ts
  - src/stores/shares.ts
  - vitest.config.ts
  - tests/unit/App.test.ts
autonomous: true
requirements: [FS-01, FS-02, FS-03]
user_setup: []
must_haves:
  truths:
    - "Devices on the same LAN can open the SPA in a browser via IP and see the app UI"
    - "User can paste/send short text to the Text Share compartment and it appears in the in-memory share list"
    - "User can select a file and start a transfer; receiver(s) on the same LAN can download the file"
    - "Shared items (text/files) are transient and are removed from availability 1 hour after upload"
    - "No persistent server-side storage is used — all data is in-memory or P2P"
  artifacts:
    - path: "src/App.svelte"
      provides: "Root SPA, renders TextShare and FileShare components"
    - path: "src/components/TextShare.svelte"
      provides: "UI for entering and listing shared text items"
    - path: "src/components/FileShare.svelte"
      provides: "UI for selecting files, showing active transfers, and downloads"
    - path: "src/lib/webrtc.ts"
      provides: "WebRTC datachannel helpers: createPeer, connect, sendChunk, onMessage"
    - path: "src/lib/ttl.ts"
      provides: "In-memory TTL store that expires items after 1 hour"
  key_links:
    - from: "src/components/FileShare.svelte"
      to: "src/lib/webrtc.ts"
      via: "establishPeer() -> datachannel.send(chunk)"
      pattern: "createDataChannel|sendChunk|onmessage"
    - from: "src/components/TextShare.svelte"
      to: "src/stores/shares.ts"
      via: "addTextShare(text)"
      pattern: "addTextShare"

---

<objective>
Build the core single-page application (SPA) that provides two compartments for text and file sharing over the LAN using P2P datachannels. No persistent backend — data lives only in memory or in P2P channels and expires after 1 hour.

Purpose: Provide a fast, minimal, and local-first sharing experience that works across devices on the same network without uploading to third-party services.
Output: Vite + Svelte SPA with TextShare and FileShare components, WebRTC helper library, TTL in-memory store, and unit test scaffold covering the basic UI and TTL behavior.
</objective>

<execution_context>
@.planning/ROADMAP.md
</execution_context>

<context>
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Wave 0 — scaffold project & test harness</name>
  <files>
    package.json, vite.config.ts, index.html, src/main.ts, src/App.svelte, vitest.config.ts, tests/unit/App.test.ts
  </files>
  <action>
    Create a minimal Vite + Svelte project scaffold (no external CI). Add package.json scripts: dev, build, test. Add vitest config and a unit test that asserts App renders and that TextShare and FileShare container elements exist (selectors: [data-test="text-share"], [data-test="file-share"]). This enables automated tests for later tasks.
    - Use modern ESM: node 18+ assumption.
    - Keep dependencies minimal: svelte, vite, vitest, @testing-library/svelte.
    - Reason: tests let later tasks provide verifiable automated checks per Nyquist rule.
  </action>
  <verify>
    <automated>npm ci && npm test --silent</automated>
    <manual>Open index.html served by Vite and confirm page loads with two compartments.</manual>
    <sampling_rate>run after this task commits, before next task begins</sampling_rate>
  </verify>
  <done>Unit tests pass; App renders with data-test attributes for text and file compartments.</done>
</task>

<task type="auto">
  <name>Task 2: Implement TextShare component & in-memory store</name>
  <files>src/components/TextShare.svelte, src/stores/shares.ts, src/App.svelte</files>
  <action>
    Implement TextShare.svelte: a textarea, Send button, and list of active shared texts. Implement src/stores/shares.ts as a small in-memory store with functions: addTextShare(text), listShares(), removeShare(id). Wire addTextShare to create an item with createdAt timestamp and TTL enforcement via src/lib/ttl.ts (see next task). Ensure UI uses data-test="text-share" for tests.
    - Do NOT add any persistent storage or remote APIs.
    - Keep types explicit (TypeScript) and avoid any use of `any`.
    - Note: Using JS/TS in the Svelte project is acceptable per toolchain decision.
  </action>
  <verify>
    <automated>npm test --silent</automated>
    <manual>In the running app, paste text and click Send; it should appear in the list immediately and carry a timestamp.</manual>
    <sampling_rate>run after this task commits, before next task begins</sampling_rate>
  </verify>
  <done>Text items can be added and listed in the UI; unit tests covering add/list behavior pass.</done>
</task>

<task type="auto">
  <name>Task 3: Implement FileShare UI, WebRTC datachannel helpers, chunked transfer, and TTL expiry</name>
  <files>src/components/FileShare.svelte, src/lib/webrtc.ts, src/lib/ttl.ts, src/stores/shares.ts</files>
  <action>
    Implement FileShare.svelte allowing file selection, showing upload progress and downloads for connected peers. Add src/lib/webrtc.ts with helper functions to create peer connections and open a reliable datachannel used for chunked file transfer. Implement chunking (e.g., 64KB chunks), reassembly on receiver, and a simple metadata handshake (filename, size, mime). Implement src/lib/ttl.ts which provides an in-memory TTL registry removing items after 3600 seconds (1 hour).
    - Use browser WebRTC DataChannel only (no server storage). For NAT traversal within LAN this will work without STUN/TURN in most local networks; include signaling hooks so the optional helper (Plan 02) can be used if desired.
    - Files must not be buffered wholly in memory longer than necessary; write chunks to a Blob and revoke references promptly after download.
    - Avoid third-party upload services and do not introduce size limits in app logic (OS/browser may limit memory but app should stream chunks).
  </action>
  <verify>
    <automated>npm test --silent</automated>
    <manual>From two devices on same LAN: open SPA, establish a peer connection (manual QR/pairing or copy code), send a small file, and confirm receiver can download it and file disappears after 1 hour.</manual>
    <sampling_rate>run after this task commits, before plan completion</sampling_rate>
  </verify>
  <done>Files can be sent via WebRTC datachannel between devices on the LAN; TTL expiry removes items after 1 hour; tests covering TTL and chunking helpers pass.</done>
</task>

</tasks>

<verification>
Overall verification: Run the unit test suite (npm test) and perform a manual LAN end-to-end check: open the SPA on two devices, create a text share and a file share, confirm transfer and that items expire and disappear after 1 hour.
</verification>

<success_criteria>
All unit tests pass and manual E2E check demonstrates text and file sharing across two devices in the same LAN with expiry after 1 hour. No server-side persistent storage is used.
</success_criteria>

<output>
After completion, create `.planning/phases/01-lan-file-share/01-lan-file-share-01-SUMMARY.md`
</output>
