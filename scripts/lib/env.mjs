/**
 * Shared helpers for the Mana Raktha Datha tooling scripts.
 * Zero dependencies on purpose - this project ships no build step.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_FILE = resolve(ROOT, '.env');
export const ENV_JS_FILE = resolve(ROOT, 'js', 'env.js');

/** Minimal .env parser: KEY=value, # comments, optional quotes, blank lines ignored. */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length > 1) ||
      (val.startsWith("'") && val.endsWith("'") && val.length > 1)
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

/** Read .env from the project root. Returns {} when the file is absent. */
export function loadEnvFile() {
  const fromDisk = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
  // On a deploy host the values come from the environment instead of a
  // file, so both are merged. Values already in .env win, so a local file can
  // override a stale host variable while debugging.
  const fromProcess = {};
  // On a deploy host these arrive as platform environment variables instead
  // of a .env file, so the server keys merge too.
  for (const k of [
    'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ADMIN_EMAIL', 'PORT',
    'API_PORT', 'API_HOST', 'SESSION_SECRET', 'APP_ORIGIN', 'SMTP_DEBUG',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_LOGIN', 'SMTP_PASSWORD', 'SMTP_SENDER', 'SMTP_SENDER_NAME',
  ]) {
    if (process.env[k]) fromProcess[k] = process.env[k];
  }
  return { ...fromProcess, ...fromDisk };
}

/** Fall back to a previously generated js/env.js so checks work after a build. */
export function loadGeneratedEnv() {
  if (!existsSync(ENV_JS_FILE)) return {};
  const src = readFileSync(ENV_JS_FILE, 'utf8');
  const url = src.match(/SUPABASE_URL:\s*["']([^"']*)["']/);
  const key = src.match(/SUPABASE_ANON_KEY:\s*["']([^"']*)["']/);
  return {
    ...(url ? { SUPABASE_URL: url[1] } : {}),
    ...(key ? { SUPABASE_ANON_KEY: key[1] } : {}),
  };
}

/** .env wins, then process env, then a previously generated js/env.js. */
export function resolveCredentials() {
  const generated = loadGeneratedEnv();
  const env = { ...generated, ...loadEnvFile() };
  let source = 'none';
  if (existsSync(ENV_FILE)) source = '.env';
  else if (env.SUPABASE_URL) source = 'environment variables';
  else if (generated.SUPABASE_URL) source = 'js/env.js';
  return {
    url: (env.SUPABASE_URL || '').trim(),
    key: (env.SUPABASE_ANON_KEY || '').trim(),
    source,
  };
}

export function isValidSupabaseUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url);
}

/** Looks like a legacy anon JWT or the newer sb_publishable_... key. */
export function looksLikeAnonKey(key) {
  return /^sb_publishable_[A-Za-z0-9_-]+$/.test(key) || /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(key);
}

/**
 * Decodes the payload of a JWT without verifying it, so we can read the role.
 * Returns {} for anything that is not a readable JWT.
 *
 * This matters: a service_role key is also a JWT starting with "eyJ", so a
 * length/format check alone would happily accept the one key that bypasses
 * every row level security rule in the database.
 */
export function decodeJwtPayload(key) {
  if (!key.startsWith('eyJ')) return {};
  const part = key.split('.')[1];
  if (!part) return {};
  try {
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

/** The role inside a legacy JWT, or 'publishable' for a new-style key. */
export function keyRole(key) {
  if (key.startsWith('sb_publishable_')) return 'publishable';
  return decodeJwtPayload(key).role || '';
}

/** True when the key would grant unrestricted database access. */
export function isServiceRoleKey(key) {
  const role = keyRole(key).toLowerCase();
  return role === 'service_role' || role === 'supabase_admin';
}

/**
 * True when a value is still the example placeholder rather than a real one.
 * Matches the literals shipped in this repo: PASTE_PROJECT_URL,
 * PASTE_ANON_PUBLIC_KEY, https://YOUR-DOMAIN/... and CHANGE_ME.
 * Deliberately does NOT match "xxx", which turns up inside real JWTs.
 */
export function isPlaceholder(value) {
  return !value || /PASTE_|YOUR[-_]|CHANGE_ME|<[^>]+>/i.test(String(value));
}

/** The exact contents written to js/env.js. Shared by build-env and dev server. */
export function renderEnvJs(url, key, source = '.env', adminEmail = '') {
  return `/* AUTO-GENERATED by scripts/build-env.mjs - do not edit, do not commit. */
/* Source: ${source}  |  Generated: ${new Date().toISOString()} */
/* Only the public anon key lives here. Never put the service_role key in this file. */
window.MRD_ENV = Object.freeze({
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(key)},
  ADMIN_EMAIL: ${JSON.stringify(adminEmail || '')}
});
`;
}
