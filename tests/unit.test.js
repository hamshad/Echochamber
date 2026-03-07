/**
 * Unit tests for pure helper functions.
 * These tests import helpers directly — no server needed.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIp, getActiveItems, items, TTL, cleanupTimer, io, server } from '../server.js';

// Tear down server-side resources so the process can exit cleanly
before(() => {
  clearInterval(cleanupTimer);
});

after(async () => {
  io.close();
  await new Promise((resolve) => server.close(resolve));
});

/* ------------------------------------------------------------------ */
/*  normalizeIp                                                        */
/* ------------------------------------------------------------------ */
describe('normalizeIp', () => {
  it('returns plain IPv4 unchanged', () => {
    assert.equal(normalizeIp('203.0.113.5'), '203.0.113.5');
  });

  it('strips ::ffff: prefix from IPv6-mapped IPv4', () => {
    assert.equal(normalizeIp('::ffff:192.168.1.1'), '192.168.1.1');
    assert.equal(normalizeIp('::ffff:10.0.0.1'), '10.0.0.1');
  });

  it('maps ::1 loopback to 127.0.0.1', () => {
    assert.equal(normalizeIp('::1'), '127.0.0.1');
  });

  it('handles null/undefined/empty by returning "local"', () => {
    assert.equal(normalizeIp(null), 'local');
    assert.equal(normalizeIp(undefined), 'local');
    assert.equal(normalizeIp(''), 'local');
  });

  it('takes the first IP from a comma-separated list', () => {
    assert.equal(normalizeIp('1.2.3.4, 5.6.7.8'), '1.2.3.4');
    assert.equal(normalizeIp('::ffff:10.0.0.1, 8.8.8.8'), '10.0.0.1');
  });

  it('trims whitespace', () => {
    assert.equal(normalizeIp('  203.0.113.5  '), '203.0.113.5');
  });

  it('passes through a full IPv6 address untouched', () => {
    assert.equal(normalizeIp('2001:db8::1'), '2001:db8::1');
  });
});

/* ------------------------------------------------------------------ */
/*  getActiveItems                                                     */
/* ------------------------------------------------------------------ */
describe('getActiveItems', () => {
  beforeEach(() => {
    items.clear();
  });

  it('returns empty array when no items exist', () => {
    assert.deepEqual(getActiveItems('room1'), []);
  });

  it('returns only items matching the given roomId', () => {
    const now = Date.now();
    items.set('a', { id: 'a', roomId: 'room1', createdAt: now, expiresAt: now + TTL });
    items.set('b', { id: 'b', roomId: 'room2', createdAt: now, expiresAt: now + TTL });
    items.set('c', { id: 'c', roomId: 'room1', createdAt: now - 1000, expiresAt: now + TTL });

    const result = getActiveItems('room1');
    assert.equal(result.length, 2);
    assert.ok(result.every(i => i.roomId === 'room1'));
  });

  it('excludes expired items', () => {
    const now = Date.now();
    items.set('fresh', { id: 'fresh', roomId: 'r', createdAt: now, expiresAt: now + 60000 });
    items.set('expired', { id: 'expired', roomId: 'r', createdAt: now - 200000, expiresAt: now - 1 });

    const result = getActiveItems('r');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'fresh');
  });

  it('sorts items newest-first (descending createdAt)', () => {
    const now = Date.now();
    items.set('old', { id: 'old', roomId: 'r', createdAt: now - 5000, expiresAt: now + TTL });
    items.set('new', { id: 'new', roomId: 'r', createdAt: now, expiresAt: now + TTL });
    items.set('mid', { id: 'mid', roomId: 'r', createdAt: now - 2000, expiresAt: now + TTL });

    const result = getActiveItems('r');
    assert.equal(result[0].id, 'new');
    assert.equal(result[1].id, 'mid');
    assert.equal(result[2].id, 'old');
  });

  it('returns all rooms when roomId is falsy', () => {
    const now = Date.now();
    items.set('a', { id: 'a', roomId: 'room1', createdAt: now, expiresAt: now + TTL });
    items.set('b', { id: 'b', roomId: 'room2', createdAt: now, expiresAt: now + TTL });

    const result = getActiveItems(null);
    assert.equal(result.length, 2);
  });
});
