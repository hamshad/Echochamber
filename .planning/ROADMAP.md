### Phase 01: LAN File Share (01-lan-file-share)

Goal: Provide a single-page application that enables quick sharing of text and documents between devices on the same local network without relying on third-party cloud storage or a persistent backend. Files and texts are transient and expire after 1 hour.

**Requirements:** [FS-01, FS-02, FS-03, FS-04]

- FS-01: The app must be scoped to the local network (LAN) and not persist files beyond 1 hour.
- FS-02: Provide two compartments: text sharing and document/file sharing.
- FS-03: Files/text are transferred on-the-fly (no permanent backend storage) and removed after 1 hour from availability.
- FS-04: The solution must be a single frontend app (no mandatory backend). An optional lightweight local signaling helper (Node script) may be provided to enable automatic discovery on the LAN.

Plans:
- 01: Core SPA (Svelte + Vite) — implements UI, P2P WebRTC pairing (manual copy/QR), chunked file transfer, TTL expiry logic. — addresses FS-01, FS-02, FS-03
- 02: Optional local signaling helper — small Node WebSocket signaling server that a user can run locally to enable automatic discovery on the LAN. — addresses FS-01, FS-04
