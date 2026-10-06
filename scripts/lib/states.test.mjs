/**
 * Self-test for the state list and search logic in ../../js/states.js
 * Run with:  node scripts/lib/states.test.mjs
 *
 * The search has to work for a Telugu speaker typing in Telugu script, which
 * is the main reason it exists rather than a plain <select>.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(resolve(ROOT, 'js', 'states.js'), 'utf8');

// states.js is a browser script, not a module, so evaluate it in a function
// that returns the helpers. Only the data functions are needed here, so the
// DOM-touching ones (statePicker, pickShow) are simply never called.
const load = new Function(`${src}\nreturn { STATES, STATE_LABEL, matchStates, isValidState };`);
const { STATES, STATE_LABEL, matchStates, isValidState } = load();

let passed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { console.log(`  \u2717 ${name}\n      ${e.message.split('\n')[0]}`); process.exitCode = 1; }
};

console.log('\nstates.js self-test\n');

t('ships all 28 states and 8 union territories', () => {
  assert.equal(STATES.length, 36);
});
t('every entry has an English and a Telugu name', () => {
  for (const s of STATES) {
    assert.ok(s.en && s.en.length > 2, `missing English name: ${JSON.stringify(s)}`);
    assert.ok(s.te && /[\u0C00-\u0C7F]/.test(s.te), `missing Telugu name for ${s.en}`);
  }
});
t('has no duplicate English names', () => {
  assert.equal(new Set(STATES.map((s) => s.en)).size, STATES.length);
});
t('includes the four states this project was built for', () => {
  for (const want of ['Telangana', 'Andhra Pradesh', 'Maharashtra', 'Karnataka']) {
    assert.ok(STATES.some((s) => s.en === want), `missing ${want}`);
  }
});
t('includes both new union territories', () => {
  assert.ok(STATES.some((s) => s.en === 'Jammu and Kashmir'));
  assert.ok(STATES.some((s) => s.en === 'Ladakh'));
});
t('labels union territories so users are not confused', () => {
  assert.equal(STATE_LABEL('Telangana'), 'Telangana');
  assert.equal(STATE_LABEL('Delhi'), 'Delhi (UT)');
});
t('empty query returns every state', () => {
  assert.equal(matchStates('').length, STATES.length);
  assert.equal(matchStates('   ').length, STATES.length);
});
t('matches the start of an English name', () => {
  const r = matchStates('tela');
  assert.equal(r[0].en, 'Telangana');
});
t('matches the middle of an English name', () => {
  assert.ok(matchStates('pradesh').some((s) => s.en === 'Andhra Pradesh'));
});
t('is case insensitive', () => {
  assert.equal(matchStates('TELANGANA')[0].en, 'Telangana');
  assert.equal(matchStates('tElAnGaNa')[0].en, 'Telangana');
});
t('matches Telugu script', () => {
  assert.equal(matchStates('\u0C24\u0C46\u0C32\u0C02')[0].en, 'Telangana');
});
t('ranks starts-with above contains', () => {
  // Two states start with "and"; the rest only contain it. The two
  // starts-with matches must come before the contains ones.
  const r = matchStates('and');
  const startsWith = r.filter((s) => s.en.toLowerCase().startsWith('and')).length;
  assert.equal(startsWith, 2);
  assert.ok(r.slice(0, 2).every((s) => s.en.toLowerCase().startsWith('and')));
  assert.ok(r.some((s) => s.en === 'Andhra Pradesh'));
  assert.ok(r.some((s) => s.en === 'Andaman and Nicobar Islands'));
  // Only the contains-only matches may appear after them.
  assert.ok(r.slice(2).every((s) => !s.en.toLowerCase().startsWith('and')));
});
t('returns nothing for gibberish', () => {
  assert.equal(matchStates('zzzzzz').length, 0);
});
t('validates a real state name', () => {
  assert.equal(isValidState('Telangana'), true);
  assert.equal(isValidState('  Telangana  '), true);
  assert.equal(isValidState('telangana'), true);
});
t('rejects a name that is not a state', () => {
  assert.equal(isValidState('Hydrabad'), false);
  assert.equal(isValidState('Kukatpally'), false);
  assert.equal(isValidState(''), false);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ', all good'}\n`);
