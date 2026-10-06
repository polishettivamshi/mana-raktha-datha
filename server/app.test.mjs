/**
 * Smoke tests: the shell boots, guards the obvious holes, and keeps
 * the {data}|{error} contract. Runs against the real file tree on port 0.
 *
 *   node server/app.test.mjs      (also part of `npm test`)
 *
 * These prove the scaffolding itself; extend them with each new endpoint.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';
import { loadEnvFile } from '../scripts/lib/env.mjs';

let server;
let base;

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

test('GET /api/health answers {data.ok:true} without leaking config values', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const body = await res.json();
  assert.equal(body.data.ok, true);
  assert.equal(typeof body.data.version, 'string');
  assert.equal(typeof body.data.config.session_secret, 'boolean');
  // The bools may be present; the values behind them may not be.
  const env = loadEnvFile();
  const flat = JSON.stringify(body);
  if (env.SESSION_SECRET) assert.ok(!flat.includes(env.SESSION_SECRET));
  if (env.SMTP_PASSWORD) assert.ok(!flat.includes(env.SMTP_PASSWORD));
  if (env.SMTP_LOGIN) assert.ok(!flat.includes(env.SMTP_LOGIN));
});

test('unknown /api path -> 404 in the {error} shape', async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('GET / serves index.html from the site root', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  assert.match(await res.text(), /<html/i);
});

test('server sources and .env are not served', async () => {
  for (const path of ['/server/index.js', '/.env', '/scripts/dev.mjs']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, `${path} must not be served`);
  }
});

test('JSON body over 16 KB -> 413 BODY_TOO_LARGE', async () => {
  const res = await fetch(`${base}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x: 'y'.repeat(20 * 1024) }),
  });
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error.code, 'BODY_TOO_LARGE');
});

test('cross-origin write -> 403 BAD_ORIGIN', async () => {
  const res = await fetch(`${base}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
    body: '{}',
  });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'BAD_ORIGIN');
});

test('local dev origin is accepted (falls through to 404, not 403)', async () => {
  const res = await fetch(`${base}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: '{}',
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'NOT_FOUND');
});
