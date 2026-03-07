/**
 * End-to-end tests — Socket.IO real-time events, room isolation, TTL cleanup.
 * Starts the server, connects Socket.IO clients, validates real-time behaviour.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { server, io, items, cleanupTimer, getActiveItems } from '../server.js';

let baseUrl;

/**
 * Helper: create a connected socket.io client with optional x-forwarded-for header.
 * Captures the initial items:sync event so it's never missed.
 */
function connectClient(ip) {
  const opts = { forceNew: true, transports: ['websocket'] };
  if (ip) {
    opts.extraHeaders = { 'x-forwarded-for': ip };
  }
  const client = ioClient(baseUrl, opts);

  // Capture the initial items:sync immediately (before connect resolves)
  client._initialSync = new Promise((resolve) => {
    client.once('items:sync', (data) => resolve(data));
  });

  return new Promise((resolve, reject) => {
    client.on('connect', () => resolve(client));
    client.on('connect_error', reject);
    setTimeout(() => reject(new Error('Client connect timeout')), 5000);
  });
}

/** Helper: wait for a specific event on a client (with timeout) */
function waitForEvent(client, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
    client.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

before(async () => {
  clearInterval(cleanupTimer);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  clearInterval(cleanupTimer);
  io.close();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  items.clear();
});

/* ------------------------------------------------------------------ */
/*  Connection & items:sync                                            */
/* ------------------------------------------------------------------ */
describe('Socket.IO connection', () => {
  it('receives items:sync on connect with current room items', async () => {
    // Pre-populate an item for the connecting IP (127.0.0.1)
    const now = Date.now();
    items.set('pre', {
      id: 'pre', type: 'text', roomId: '127.0.0.1', content: 'existing',
      createdAt: now, expiresAt: now + 3600000
    });

    const client = await connectClient();
    const syncData = await client._initialSync;
    assert.ok(Array.isArray(syncData));
    assert.equal(syncData.length, 1);
    assert.equal(syncData[0].id, 'pre');
    client.disconnect();
  });

  it('receives empty items:sync when no items exist', async () => {
    const client = await connectClient();
    const syncData = await client._initialSync;
    assert.ok(Array.isArray(syncData));
    assert.equal(syncData.length, 0);
    client.disconnect();
  });
});

/* ------------------------------------------------------------------ */
/*  Real-time item:added broadcast                                     */
/* ------------------------------------------------------------------ */
describe('item:added broadcast', () => {
  it('broadcasts item:added to connected clients when text is posted', async () => {
    const client = await connectClient();
    await client._initialSync;

    // Set up listener BEFORE posting
    const addedPromise = waitForEvent(client, 'item:added');

    // POST a text item
    await fetch(`${baseUrl}/api/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'real-time test' })
    });

    const addedItem = await addedPromise;
    assert.equal(addedItem.type, 'text');
    assert.equal(addedItem.content, 'real-time test');
    client.disconnect();
  });
});

/* ------------------------------------------------------------------ */
/*  Real-time item:removed broadcast                                   */
/* ------------------------------------------------------------------ */
describe('item:removed broadcast', () => {
  it('broadcasts item:removed when item is deleted', async () => {
    const client = await connectClient();
    await client._initialSync;

    // Set up listener for item:added so we know when it arrives
    const addedPromise = waitForEvent(client, 'item:added');

    // Create an item via API
    const createRes = await fetch(`${baseUrl}/api/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'will be deleted' })
    });
    const created = await createRes.json();

    // Wait for the item:added event to arrive
    await addedPromise;

    // Now set up listener for removal
    const removedPromise = waitForEvent(client, 'item:removed');

    // DELETE the item
    await fetch(`${baseUrl}/api/items/${created.id}`, { method: 'DELETE' });

    const removedData = await removedPromise;
    assert.equal(removedData.id, created.id);
    client.disconnect();
  });
});

/* ------------------------------------------------------------------ */
/*  Room isolation                                                     */
/* ------------------------------------------------------------------ */
describe('Room isolation', () => {
  it('clients in different rooms do NOT receive each other\'s events', async () => {
    // Client A connects from IP 1.1.1.1
    const clientA = await connectClient('1.1.1.1');
    await clientA._initialSync;

    // Client B connects from IP 2.2.2.2
    const clientB = await connectClient('2.2.2.2');
    await clientB._initialSync;

    // Track events received by each client
    let clientAReceived = null;
    let clientBReceived = null;
    clientA.on('item:added', (item) => { clientAReceived = item; });
    clientB.on('item:added', (item) => { clientBReceived = item; });

    // Post a text item as IP 1.1.1.1 (via HTTP with x-forwarded-for)
    await fetch(`${baseUrl}/api/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '1.1.1.1'
      },
      body: JSON.stringify({ content: 'from room A' })
    });

    // Wait for events to propagate
    await new Promise(r => setTimeout(r, 300));

    assert.ok(clientAReceived, 'Client A should receive the item');
    assert.equal(clientAReceived.content, 'from room A');
    assert.equal(clientBReceived, null, 'Client B should NOT receive the item');

    clientA.disconnect();
    clientB.disconnect();
  });

  it('clients in the same room receive each other\'s events', async () => {
    // Both clients connect from the same IP
    const clientA = await connectClient('3.3.3.3');
    await clientA._initialSync;

    const clientB = await connectClient('3.3.3.3');
    await clientB._initialSync;

    let clientBReceived = null;
    clientB.on('item:added', (item) => { clientBReceived = item; });

    // Post as the same IP
    await fetch(`${baseUrl}/api/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '3.3.3.3'
      },
      body: JSON.stringify({ content: 'same room' })
    });

    await new Promise(r => setTimeout(r, 300));

    assert.ok(clientBReceived, 'Client B should receive the item from same room');
    assert.equal(clientBReceived.content, 'same room');

    clientA.disconnect();
    clientB.disconnect();
  });
});

/* ------------------------------------------------------------------ */
/*  TTL / Cleanup                                                      */
/* ------------------------------------------------------------------ */
describe('TTL cleanup', () => {
  it('removes expired items and broadcasts items:sync', async () => {
    // Manually insert an already-expired item and a fresh one
    const now = Date.now();
    items.set('expired-1', {
      id: 'expired-1', type: 'text', roomId: '127.0.0.1', content: 'old',
      createdAt: now - 200000, expiresAt: now - 1
    });
    items.set('fresh-1', {
      id: 'fresh-1', type: 'text', roomId: '127.0.0.1', content: 'new',
      createdAt: now, expiresAt: now + 3600000
    });

    const client = await connectClient();
    // Initial sync should only have 'fresh-1' since getActiveItems filters expired
    const initialSync = await client._initialSync;
    assert.equal(initialSync.length, 1);
    assert.equal(initialSync[0].id, 'fresh-1');

    // Set up listener for the cleanup broadcast
    const syncPromise = waitForEvent(client, 'items:sync');

    // Manually trigger cleanup logic (simulates the setInterval callback)
    const affectedRooms = new Set();
    for (const [id, item] of items) {
      if (Date.now() > item.expiresAt) {
        affectedRooms.add(item.roomId);
        items.delete(id);
      }
    }
    for (const roomId of affectedRooms) {
      io.to(roomId).emit('items:sync', getActiveItems(roomId));
    }

    const syncData = await syncPromise;
    assert.ok(Array.isArray(syncData));
    // Only fresh item should remain
    assert.equal(syncData.length, 1);
    assert.equal(syncData[0].id, 'fresh-1');

    // expired-1 should be gone from the Map
    assert.ok(!items.has('expired-1'));

    client.disconnect();
  });
});
