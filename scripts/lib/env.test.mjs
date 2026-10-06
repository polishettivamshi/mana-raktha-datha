/**
 * Self-test for the credential helpers in ./env.mjs
 * Run with:  npm test
 *
 * The case that matters most is at the bottom: a service_role key is a
 * perfectly well-formed JWT, so a format check alone will not catch it.
 */
import assert from 'node:assert/strict';
import {
  parseEnv, isValidSupabaseUrl, looksLikeAnonKey, isPlaceholder,
  decodeJwtPayload, keyRole, isServiceRoleKey,
} from './env.mjs';

const b64 = (s) => Buffer.from(s).toString('base64url');
/** A real JWT is base64(header).base64(payload).base64(signature). */
const jwt = (payload) => `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify(payload))}.${b64('x'.repeat(80))}`;

let passed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { console.log(`  \u2717 ${name}\n      ${e.message.split('\n')[0]}`); process.exitCode = 1; }
};

console.log('\nenv.mjs self-test\n');

t('parses KEY=value, comments, quotes and blank lines', () => {
  assert.deepEqual(parseEnv('# c\nA=1\n\nB="two"\nC=\'three\'\n'), { A: '1', B: 'two', C: 'three' });
});
t('keeps a value that contains an equals sign', () => {
  assert.deepEqual(parseEnv('URL=https://x.co?a=1'), { URL: 'https://x.co?a=1' });
});
t('accepts real Supabase URLs', () => {
  assert.equal(isValidSupabaseUrl('https://abcdefghijklmnop.supabase.co'), true);
  assert.equal(isValidSupabaseUrl('https://abcdefghijklmnop.supabase.co/'), true);
  assert.equal(isValidSupabaseUrl('https://abcdefghijklmnop.supabase.in'), true);
});
t('rejects URLs that are not Supabase', () => {
  assert.equal(isValidSupabaseUrl('https://notsupabase.example.com'), false);
  assert.equal(isValidSupabaseUrl('http://abcdefghijklm.supabase.co'), false);
  assert.equal(isValidSupabaseUrl('PASTE_PROJECT_URL'), false);
});
t('detects placeholder values', () => {
  assert.equal(isPlaceholder('PASTE_ANON_PUBLIC_KEY'), true);
  assert.equal(isPlaceholder('https://YOUR-DOMAIN/x'), true);
  assert.equal(isPlaceholder(''), true);
  assert.equal(isPlaceholder('eyJhbGciOiJIUzI1NiJ9'), false);
});
t('accepts a new-style publishable key', () => {
  const k = 'sb_publishable_abcdefghijklmnopqrstuvwxyz';
  assert.equal(looksLikeAnonKey(k), true);
  assert.equal(keyRole(k), 'publishable');
  assert.equal(isServiceRoleKey(k), false);
});
t('decodes a JWT payload', () => {
  assert.equal(decodeJwtPayload(jwt({ role: 'anon', iss: 'supabase' })).iss, 'supabase');
  assert.deepEqual(decodeJwtPayload('not-a-jwt'), {});
  assert.deepEqual(decodeJwtPayload(''), {});
});
t('reads the role out of a legacy JWT', () => {
  assert.equal(keyRole(jwt({ role: 'anon' })), 'anon');
  assert.equal(keyRole(jwt({ role: 'authenticated' })), 'authenticated');
});
t('FLAGS a service_role key even though it is a valid JWT', () => {
  const k = jwt({ role: 'service_role', iss: 'supabase' });
  assert.equal(looksLikeAnonKey(k), true);   // it really does look fine
  assert.equal(isServiceRoleKey(k), true);   // but it must still be refused
});
t('FLAGS a supabase_admin key', () => {
  assert.equal(isServiceRoleKey(jwt({ role: 'supabase_admin' })), true);
});
t('does not flag an ordinary anon key', () => {
  assert.equal(isServiceRoleKey(jwt({ role: 'anon' })), false);
  assert.equal(isServiceRoleKey(jwt({ role: 'authenticated' })), false);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ', all good'}\n`);
