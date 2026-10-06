/**
 * The Express application - created by createApp() so tests can listen on
 * port 0 without touching any network configuration.
 *
 * Conventions every endpoint follows:
 *   success: { "data": ... }   failure: { "error": { "code", "message" } }
 *   JSON bodies capped at 16 KB, writes refused cross-origin, and the same
 *   security headers Cloudflare Pages sends from _headers.
 *
 * Current state: health endpoint, static site, shared guards. New routes join
 * the /api router; the static site and the guards stay as they are.
 */
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadEnvFile } from '../scripts/lib/env.mjs';
import { healthHandler } from './routes/health.js';

// Never serve these from the site root (the same rule scripts/dev.mjs
// applies, plus the two directories that only exist server-side). The path
// is percent-decoded first so /server%2Findex.js cannot slip past.
const BLOCKED =
  /(^|\/)(\.env|\.git|node_modules|supabase|scripts|server|docs|package(?:-lock)?\.json)($|\/)/;

// Verbatim from _headers so a response from this server is indistinguishable
// from one Cloudflare Pages would have sent.
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src https://www.youtube.com; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'",
};

/**
 * CSRF guard (§4): browsers attach an Origin header to cross-site writes, so
 * accepting only APP_ORIGIN (or a local dev origin) costs nothing and closes
 * the classic cookie CSRF hole before Phase 2 even introduces cookies.
 * Requests with no Origin at all (curl, tests) pass: there is no browser
 * whose ambient credentials could be abused.
 */
function makeCsrfGuard(appOrigin) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    let ok = false;
    try {
      const u = new URL(origin);
      ok =
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        (!!appOrigin && origin.replace(/\/$/, '') === appOrigin);
    } catch {
      ok = false;
    }
    if (ok) return next();
    res.status(403).json({
      error: { code: 'BAD_ORIGIN', message: 'Cross-origin request refused.' },
    });
  };
}

export function createApp() {
  const env = loadEnvFile();
  const appOrigin = (env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  const csrf = makeCsrfGuard(appOrigin);

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
    next();
  });

  // ---- /api ---------------------------------------------------------------
  const api = express.Router();
  api.use(express.json({ limit: '16kb' })); // §4: cap before any handler runs
  api.get('/health', healthHandler);
  // Every route answers {data}|{error}, so unknown paths get the same shape.
  api.use((req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } }),
  );
  app.use('/api', csrf, api);

  // ---- static site --------------------------------------------------------
  app.use((req, res, next) => {
    let decoded = req.path;
    try {
      decoded = decodeURIComponent(req.path);
    } catch {
      /* malformed escape: keep the raw path, static will 404 it */
    }
    if (BLOCKED.test(decoded))
      return res.status(404).type('text').end('Not found');
    next();
  });
  app.use(
    express.static(ROOT, {
      index: 'index.html',
      dotfiles: 'ignore', // .env, .env.example, .git never leave
      setHeaders(res, filePath) {
        const p = filePath.replace(/\\/g, '/');
        if (p.endsWith('/js/env.js'))
          res.setHeader('Cache-Control', 'no-store, max-age=0');
        else if (p.endsWith('.html'))
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        else if (/\/js\//.test(p))
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        else if (/\/css\//.test(p))
          res.setHeader('Cache-Control', 'public, max-age=3600');
        else if (/\/images\//.test(p))
          res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      },
    }),
  );

  // Unknown path -> the same 404 page Cloudflare Pages would send.
  app.use((req, res) => {
    const page = resolve(ROOT, '404.html');
    if (existsSync(page)) res.status(404).sendFile(page);
    else res.status(404).type('text').end('Not found');
  });

  // ---- errors (the {error} shape even for middleware failures) ------------
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large')
      return res
        .status(413)
        .json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body exceeds 16 KB.' } });
    if (err?.type === 'entity.parse.failed')
      return res
        .status(400)
        .json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
    console.error(err);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL', message: 'Unexpected server error.' } });
  });

  return app;
}
