#!/usr/bin/env node
/**
 * The API server - /api plus the static site.
 *
 *   npm run dev:api     this file alone, on API_PORT (default 3000)
 *   npm run dev         the static dev server spawns this and proxies /api
 *
 * Bound to loopback by default; put a reverse proxy in front before exposing
 * it. It serves the static site as well when it runs standalone, so one port
 * is enough for a local smoke test.
 */
import { createApp } from './app.js';
import { loadEnvFile } from '../scripts/lib/env.mjs';

const env = loadEnvFile();
const port = Number(env.API_PORT || 3000);
const host = (env.API_HOST || '127.0.0.1').trim();

const server = createApp().listen(port, host);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(
      `\nAPI port ${port} is already in use. Stop the other process or set API_PORT in .env.\n`,
    );
    process.exit(1);
  }
  throw e;
});

// Ctrl+C / systemd stop: close the listener before the process ends.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
