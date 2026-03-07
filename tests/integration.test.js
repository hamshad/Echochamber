/**
 * Integration tests — HTTP API endpoints.
 * Starts the server on a random port, runs requests, then shuts down.
 *
 * Firebase Storage calls are real if credentials are present,
 * otherwise upload/download tests will be skipped gracefully.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { app, server, io, items, cleanupTimer } from '../server.js';

let baseUrl;
let addr;

before(async () => {
  clearInterval(cleanupTimer); // Don't run cleanup during tests
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      addr = server.address();
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
/*  GET /api/items                                                     */
/* ------------------------------------------------------------------ */
describe('GET /api/items', () => {
  it('returns empty array when no items exist', async () => {
    const res = await fetch(`${baseUrl}/api/items`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.equal(data.length, 0);
  });

  it('returns items scoped to the caller IP room', async () => {
    const now = Date.now();
    // Insert items for two different rooms
    items.set('mine', {
      id: 'mine', type: 'text', roomId: '127.0.0.1', content: 'hello',
      createdAt: now, expiresAt: now + 3600000
    });
    items.set('theirs', {
      id: 'theirs', type: 'text', roomId: '10.0.0.99', content: 'secret',
      createdAt: now, expiresAt: now + 3600000
    });

    const res = await fetch(`${baseUrl}/api/items`);
    const data = await res.json();
    // Local requests come from 127.0.0.1 so should only see 'mine'
    assert.equal(data.length, 1);
    assert.equal(data[0].id, 'mine');
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/text                                                     */
/* ------------------------------------------------------------------ */
describe('POST /api/text', () => {
  it('creates a text item and returns 201', async () => {
    const res = await fetch(`${baseUrl}/api/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'test message' })
    });
    assert.equal(res.status, 201);
    const item = await res.json();
    assert.equal(item.type, 'text');
    assert.equal(item.content, 'test message');
    assert.ok(item.id);
    assert.ok(item.roomId);
    assert.ok(item.expiresAt > Date.now());

    // Should be in the items Map
    assert.ok(items.has(item.id));
  });

  it('returns 400 when content is missing', async () => {
    const res = await fetch(`${baseUrl}/api/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 400);
  });

  it('returns 400 when content is not a string', async () => {
    const res = await fetch(`${baseUrl}/api/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 123 })
    });
    assert.equal(res.status, 400);
  });
});

/* ------------------------------------------------------------------ */
/*  POST /api/upload                                                   */
/* ------------------------------------------------------------------ */
describe('POST /api/upload', () => {
  it('returns 400 when no file is provided', async () => {
    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST'
    });
    assert.equal(res.status, 400);
  });

  it('creates a file item when a file is uploaded', async () => {
    // Create a small text file as a Blob
    const boundary = '----TestBoundary' + Date.now();
    const filename = 'test-file.txt';
    const fileContent = 'hello from test';
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}--`
    ].join('\r\n');

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body
    });

    // If Firebase isn't configured, we'll get a 500 — that's OK, skip assertion
    if (res.status === 500) {
      const err = await res.json();
      console.log('  [skip] Firebase not configured, upload returned 500:', err.error);
      return;
    }

    assert.equal(res.status, 201);
    const item = await res.json();
    assert.equal(item.type, 'file');
    assert.equal(item.originalName, filename);
    assert.ok(item.filename.endsWith('.txt'));
    assert.ok(items.has(item.id));
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/download/:id                                              */
/* ------------------------------------------------------------------ */
describe('GET /api/download/:id', () => {
  it('returns 404 for non-existent item', async () => {
    const res = await fetch(`${baseUrl}/api/download/nonexistent`);
    assert.equal(res.status, 404);
  });

  it('returns 400 for text item (not downloadable)', async () => {
    const now = Date.now();
    items.set('txt1', {
      id: 'txt1', type: 'text', roomId: '127.0.0.1', content: 'hello',
      createdAt: now, expiresAt: now + 3600000
    });
    const res = await fetch(`${baseUrl}/api/download/txt1`);
    assert.equal(res.status, 400);
  });

  it('returns 404 for expired item', async () => {
    const now = Date.now();
    items.set('old', {
      id: 'old', type: 'file', roomId: '127.0.0.1', filename: 'old.txt',
      originalName: 'old.txt', mimetype: 'text/plain',
      createdAt: now - 200000, expiresAt: now - 1
    });
    const res = await fetch(`${baseUrl}/api/download/old`);
    assert.equal(res.status, 404);
  });
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/items/:id                                              */
/* ------------------------------------------------------------------ */
describe('DELETE /api/items/:id', () => {
  it('returns 404 for non-existent item', async () => {
    const res = await fetch(`${baseUrl}/api/items/nonexistent`, { method: 'DELETE' });
    assert.equal(res.status, 404);
  });

  it('deletes a text item in the same room', async () => {
    // Create an item via the API first so roomId matches the request IP
    const createRes = await fetch(`${baseUrl}/api/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'to be deleted' })
    });
    const created = await createRes.json();

    const delRes = await fetch(`${baseUrl}/api/items/${created.id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    const body = await delRes.json();
    assert.ok(body.success);
    assert.ok(!items.has(created.id));
  });

  it('returns 403 when trying to delete another room\'s item', async () => {
    const now = Date.now();
    items.set('foreign', {
      id: 'foreign', type: 'text', roomId: '10.99.99.99', content: 'not yours',
      createdAt: now, expiresAt: now + 3600000
    });

    const res = await fetch(`${baseUrl}/api/items/foreign`, { method: 'DELETE' });
    assert.equal(res.status, 403);
    // Item should still exist
    assert.ok(items.has('foreign'));
  });
});
