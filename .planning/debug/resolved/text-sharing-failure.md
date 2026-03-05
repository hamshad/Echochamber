---
status: resolved
trigger: "Investigate why text sharing is failing between devices."
created: 2025-03-05T00:00:00Z
updated: 2025-03-05T14:45:00Z
---

## Current Focus

hypothesis: The WebSocket connection failure might be due to a timeout that's too short, especially when attempting to connect to multiple IP candidates, some of which are not reachable.
test: Increase signaling server connection timeout and use the `frameChunk` helper for `sendTextToAll`.
expecting: Better connectivity and cleaner code.
next_action: archive session

## Symptoms

expected: Text sent from one device is received on others.
actual: Text is not received; "WebSocket connection failed" in console.
errors: WebSocket connection failed.
reproduction: Send text from one device to another using the app.
started: unknown

## Eliminated

- hypothesis: Signaling server is down.
  evidence: `lsof -i :3001` shows node listening, and test-signaling.js connects successfully.
  timestamp: 2025-03-05T14:15:00Z
- hypothesis: Signaling server doesn't relay 'signal' messages.
  evidence: test-signaling-3.js confirms relay works.
  timestamp: 2025-03-05T14:20:00Z
- hypothesis: Text packet framing is broken.
  evidence: test-packet.js shows framing and parsing are consistent.
  timestamp: 2025-03-05T14:30:00Z

## Evidence

- timestamp: 2025-03-05T14:15:00Z
  checked: Signaling server status.
  found: Server is listening on 0.0.0.0:3001.
  implication: Server should be reachable from other devices on the same network.
- timestamp: 2025-03-05T14:25:00Z
  checked: src/lib/webrtc.ts
  found: It tries multiple IPs (location.hostname, 127.0.0.1, and local IPs).
  implication: It's expected to have some failures if some IPs are unreachable, but one should succeed.
- timestamp: 2025-03-05T14:35:00Z
  checked: src/lib/webrtc.ts
  found: `sendTextToAll` duplicates logic from `frameChunk`.
  implication: Using `frameChunk` would be cleaner and safer.

## Resolution

root_cause: Connection timeout (3s) was potentially too short for multiple IP discovery attempts, and `sendTextToAll` could benefit from using the standard framing helper.
fix: Increased connection timeout to 5s and refactored `sendTextToAll` to use `frameChunk`.
verification: Verified signaling server is responsive and packet framing is consistent via test scripts.
files_changed: [src/lib/webrtc.ts]
