---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/webrtc.ts
  - src/components/TextShare.svelte
  - tests/unit/shares.test.ts
autonomous: true
requirements: [QS-01]
user_setup: []
must_haves:
  truths:
    - "Text typed on one device appears on other devices on the same LAN without manual pairing or page refresh"
    - "No persistent backend is used for text sync; texts are delivered over the LAN mesh"
    - "Texts still expire after 1 hour and are pruned from the store"
  artifacts:
    - path: "src/lib/webrtc.ts"
      provides: "sendTextToAll(text) and incoming text handling that calls addTextShare for remote texts"
    - path: "src/components/TextShare.svelte"
      provides: "Calls sendTextToAll when a user sends text and shows $shares"
    - path: "tests/unit/shares.test.ts"
      provides: "Unit tests verifying addTextShare and listShares behavior"
  key_links:
    - from: "src/components/TextShare.svelte"
      to: "src/lib/webrtc.ts"
      via: "sendTextToAll(text)"
    - from: "src/lib/webrtc.ts"
      to: "src/stores/shares.ts"
      via: "import addTextShare on incoming text messages"

---

<objective>
Make text sharing automatic across the LAN mesh so when a user sends text on one device it is broadcast to all connected devices without manual pairing or refresh. Add a small unit test for the shares store to allow automated verification.

Purpose: Fix the current behavior where text is stored only locally and not broadcast; align app behavior to the user's expectation of instant LAN-wide text visibility.
Output: sendTextToAll implementation in src/lib/webrtc.ts, TextShare wired to call it, and unit test ensuring shares store behavior.
</objective>

<execution_context>
Quick task: small, ad-hoc fix. Follow quick workflow: create one plan with 2-3 tasks, atomic commits, update STATE.md quick table after completion.
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/01-lan-file-share/01-lan-file-share-01-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Wave 0: Add unit tests for shares store</name>
  <files>tests/unit/shares.test.ts</files>
  <action>
    Add a unit test that imports src/stores/shares.ts, calls addTextShare('hello'), and asserts that listShares() (subscribe) contains the new item. This gives an automated verification target so subsequent code changes can run npm test.
    Keep test simple and deterministic.
  </action>
  <verify>
    <automated>npm test --silent tests/unit/shares.test.ts</automated>
    <manual>None</manual>
    <sampling_rate>run after this task commits, before next task begins</sampling_rate>
  </verify>
  <done>Test file exists and passes (npm test for that file returns success).</done>
</task>

<task type="auto">
  <name>Task 2: Implement text broadcast and incoming text handling in webrtc library</name>
  <files>src/lib/webrtc.ts</files>
  <action>
    - Add export async function sendTextToAll(text: string) that frames a small JSON meta (type: 'text', id, text, ts) and sends to all open datachannels (channels map).
    - In setupDataChannel onmessage, when receiving a framed packet whose meta.type === 'text', call (dynamic import) addTextShare(meta.text) to add the remote text to the local store.
    - Keep message framing consistent with existing chunk framing helpers (use frameChunk/parsePacket).
    - Do NOT change file TTL behavior; remote additions should be timestamped when added.
  </action>
  <verify>
    <automated>npm test --silent</automated>
    <manual>Open SPA on two devices on same LAN, send text on Device A and confirm Device B shows it without pairing or refresh.</manual>
    <sampling_rate>run after this task commits, before next task begins</sampling_rate>
  </verify>
  <done>sendTextToAll is present and incoming remote texts result in addTextShare being called (manual E2E verifies cross-device delivery).</done>
</task>

<task type="auto">
  <name>Task 3: Wire TextShare UI to broadcast text over mesh</name>
  <files>src/components/TextShare.svelte</files>
  <action>
    - Import sendTextToAll (dynamic import or named import) and call it when user sends text after calling addTextShare locally.
    - Ensure UI still shows the user's local text immediately.
    - Keep changes minimal: one-line call to sendTextToAll with try/catch to avoid breaking when mesh has no peers.
  </action>
  <verify>
    <automated>npm test --silent</automated>
    <manual>Same manual E2E: open SPA on two devices, send text on one, verify other receives it automatically.</manual>
  </verify>
  <done>TextShare sends text to mesh; receiving peers add it to their local store without user pairing.</done>
</task>

</tasks>

<verification>
Automated: npm test (unit tests pass). Manual: Open app on two devices in same LAN and confirm text sync works without pairing.
</verification>

<success_criteria>
1) tests/unit/shares.test.ts exists and passes
2) sendTextToAll exported from src/lib/webrtc.ts
3) TextShare calls sendTextToAll on send
4) Manual E2E: text sent on one device appears on other device without pairing and is pruned after 1 hour
</success_criteria>

<output>
After completion, create `.planning/quick/001-auto-text-sync/001-auto-text-sync-SUMMARY.md` and update .planning/STATE.md Quick Tasks Completed table.
</output>
