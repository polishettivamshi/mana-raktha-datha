/**
 * GET /api/health - the one endpoint that must exist from day one.
 * An uptime monitor probes it and it answers the only question such a monitor
 * can ask: is the process alive?
 *
 * It reports whether config is present, never its values - a public health
 * URL must not turn into an information leak, so everything here is a bool.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadEnvFile, isPlaceholder } from '../../scripts/lib/env.mjs';

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const startedAt = Date.now();

/** A value counts as configured only when it is set and not a PASTE_ placeholder. */
const set = (v) => {
  const s = (v || '').trim();
  return s.length > 0 && !isPlaceholder(s);
};

export function healthHandler(req, res) {
  const env = loadEnvFile();
  res.status(200).json({
    data: {
      ok: true,
      version: pkg.version,
      uptime_s: Math.round((Date.now() - startedAt) / 1000),
      config: {
        session_secret: set(env.SESSION_SECRET),
        smtp: set(env.SMTP_LOGIN) && set(env.SMTP_PASSWORD),
      },
    },
  });
}
