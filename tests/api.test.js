import t from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fetch from 'node-fetch';

// Simple integration test that starts the server as a child process,
// runs a small sequence of HTTP requests against it, and then stops it.

const SERVER_START_TIMEOUT = 5000;
const SERVER_STOP_TIMEOUT = 3000;

function startServer() {
  const child = spawn(process.execPath, ['server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    const onData = (data) => {
      const s = String(data);
      if (s.includes('Echochamber is running')) {
        child.stdout.off('data', onData);
        resolve(child);
      }
    };
    child.stdout.on('data', onData);
    child.on('error', reject);
    setTimeout(() => reject(new Error('Server did not start in time')), SERVER_START_TIMEOUT);
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.kill('SIGINT');
    setTimeout(() => resolve(), SERVER_STOP_TIMEOUT);
  });
}

t('server: basic text share flow', async () => {
  const server = await startServer();
  try {
    // GET items (should be [])
    const before = await fetch('http://localhost:3000/api/items');
    assert.strictEqual(before.status, 200);
    const beforeJson = await before.json();
    assert.ok(Array.isArray(beforeJson));

    // POST text
    const post = await fetch('http://localhost:3000/api/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'test from automated test' }),
    });
    assert.strictEqual(post.status, 201);
    const postJson = await post.json();
    assert.ok(postJson.id, 'Response should include id');

    // GET items again
    const after = await fetch('http://localhost:3000/api/items');
    assert.strictEqual(after.status, 200);
    const afterJson = await after.json();
    assert.ok(afterJson.length >= 1, 'There should be at least one item after posting text');

    // DELETE the item
    const del = await fetch(`http://localhost:3000/api/items/${postJson.id}`, { method: 'DELETE' });
    assert.strictEqual(del.status, 200);
    const final = await fetch('http://localhost:3000/api/items');
    const finalJson = await final.json();
    assert.ok(Array.isArray(finalJson));
  } finally {
    await stopServer(server);
  }
});
