/**
 * Self-test for the SQL analyzer in ./sql-lint.mjs
 * Run with:  node scripts/lib/sql-lint.test.mjs
 *
 * A checker that never fails is worthless, so each test here feeds it broken
 * SQL on purpose and expects it to complain.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripLiterals, checkBalance, collectDefinitions, splitStatements, statementPreview, analyzeSchema, SQL_TRAPS } from './sql-lint.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let passed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { console.log(`  \u2717 ${name}\n      ${e.message.split('\n')[0]}`); process.exitCode = 1; }
};

console.log('\nsql-lint.mjs self-test\n');

t('strips line comments', () => {
  // Contents are replaced with spaces so character offsets stay valid.
  assert.equal(stripLiterals('a -- select 1\nb').replace(/ /g, ''), 'a\nb');
});
t('strips block comments', () => {
  assert.equal(stripLiterals('a /* select */ b').replace(/ /g, ''), 'ab');
});
t('strips single-quoted strings', () => {
  assert.equal(stripLiterals("select 'abc'").trim(), 'select');
});
t('keeps the escaped quote pair inside a string', () => {
  // 'it''s here' is one string; the text after it must survive.
  assert.equal(stripLiterals("select 'it''s here' from t").replace(/ /g, ''), 'selectfromt');
});
t('strips a dollar-quoted body entirely', () => {
  assert.equal(stripLiterals('do $$ select 1; $$').trim(), 'do');
});

t('accepts balanced SQL', () => {
  assert.deepEqual(checkBalance("create function f() returns int as $$ select 1 $$ language sql;"), []);
});
t('catches an unclosed parenthesis', () => {
  assert.equal(checkBalance('select (1, 2').length > 0, true);
});
t('catches an extra closing parenthesis', () => {
  assert.equal(checkBalance('select 1)').length > 0, true);
});
t('catches an unclosed dollar quote', () => {
  assert.equal(checkBalance("create function f() as $$ select 1;").length > 0, true);
});
t('ignores parentheses inside strings', () => {
  assert.deepEqual(checkBalance("select '((((' as x"), []);
});
t('ignores a semicolon inside a dollar-quoted body', () => {
  assert.deepEqual(checkBalance('create function f() returns void as $$ begin; end; $$ language plpgsql;'), []);
});

t('finds function and table definitions', () => {
  const d = collectDefinitions(
    'create table if not exists public.profiles (id uuid);' +
    'create or replace function public.is_admin() returns boolean as $$ select true $$ language sql;'
  );
  assert.equal(d.tables.has('profiles'), true);
  assert.equal(d.functions.has('is_admin'), true);
});

t('flags a trigger calling a function that does not exist', () => {
  const r = analyzeSchema(
    'create table if not exists t (id int);' +
    'create trigger x before insert on t for each row execute function public.ghost();'
  );
  assert.equal(r.problems.some((p) => p.includes('ghost')), true);
});
t('flags a policy on a table that does not exist', () => {
  const r = analyzeSchema('create policy p on phantom for select using (true);');
  assert.equal(r.problems.some((p) => p.includes('phantom')), true);
});
// --- known-invalid Postgres constructs ---------------------------------------
// Regression test: this exact statement stopped the schema push at #4 on a
// live project. It must be caught statically now.
t('catches ALTER COLUMN ... SET UNIQUE (the real bug)', () => {
  const r = analyzeSchema(
    'do $$ begin\n' +
    '  if not exists (select 1 from t) then\n' +
    '    alter table public.t alter column email set unique;\n' +
    '  end if;\n' +
    'end $$;'
  );
  assert.ok(r.problems.some((p) => /cannot be set with SET/.test(p)),
    `expected the SET UNIQUE trap, got: ${JSON.stringify(r.problems)}`);
});
t('catches SET CHECK and SET PRIMARY KEY too', () => {
  assert.ok(analyzeSchema('alter table t alter column age set check (age > 0);')
    .problems.some((p) => /cannot be set with SET/.test(p)));
  assert.ok(analyzeSchema('alter table t alter column id set primary key;')
    .problems.some((p) => /cannot be set with SET/.test(p)));
});
t('catches DROP CONSTRAINT IF EXISTS in the wrong position', () => {
  assert.ok(analyzeSchema('alter table t drop constraint if exists c_name;')
    .problems.some((p) => /IF EXISTS does not follow DROP CONSTRAINT/.test(p)));
});
t('does not flag valid ALTER COLUMN ... SET forms', () => {
  const r = analyzeSchema(
    'alter table t alter column c set not null;\nalter table t alter column c set default 0;'
  );
  assert.deepEqual(r.problems, []);
});
t('does not flag the correct unique constraint form', () => {
  const good = "execute 'alter table public.profiles add constraint profiles_email_key unique (email)';";
  // Which trap, if any, is matching? Knowing this makes the fix obvious.
  const hits = SQL_TRAPS.filter((tr) => [...good.matchAll(tr.pattern)].length > 0);
  assert.deepEqual(hits.map((h) => h.what), [], `wrongly matched by: ${hits.map((h) => h.pattern)}`);
});
t('every trap is reachable and each has a fix message', () => {
  assert.ok(SQL_TRAPS.length >= 4);
  for (const trap of SQL_TRAPS) {
    assert.ok(trap.pattern instanceof RegExp, 'pattern must be a RegExp');
    assert.ok(trap.pattern.global, 'pattern needs the g flag to match more than once');
    assert.ok(trap.what && trap.fix, 'each trap needs an explanation and a fix');
  }
});
t('the real schema.sql contains none of the known traps', () => {
  const sql = readFileSync(resolve(ROOT, 'supabase', 'schema.sql'), 'utf8');
  assert.deepEqual(analyzeSchema(sql).problems, []);
});

t('accepts the real schema.sql with no problems', () => {
  const sql = readFileSync(resolve(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const r = analyzeSchema(sql);
  assert.deepEqual(r.problems, []);
  assert.equal(r.tables.has('profiles'), true);
  assert.equal(r.tables.has('reveals'), true);
  assert.equal(r.functions.has('reveal_phone'), true);
  assert.equal(r.functions.has('make_first_admin'), true);
});
t('finds every trigger target in the real schema', () => {
  const sql = readFileSync(resolve(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const r = analyzeSchema(sql);
  assert.equal(r.problems.filter((p) => p.includes('never defined')).length, 0);
});
// --- statement splitting -----------------------------------------------------
t('splits plain statements on semicolons', () => {
  assert.deepEqual(splitStatements('select 1; select 2;'), ['select 1', 'select 2']);
});
t('drops a trailing empty statement', () => {
  assert.deepEqual(splitStatements('select 1;'), ['select 1']);
  assert.deepEqual(splitStatements('select 1'), ['select 1']);
});
t('does not split on a semicolon inside a string', () => {
  assert.deepEqual(splitStatements("select 'a;b';"), ["select 'a;b'"]);
});
t('does not split inside a dollar-quoted block', () => {
  const sql = 'do $$ begin raise notice \'x;y\'; end $$; select 1;';
  const out = splitStatements(sql);
  assert.equal(out.length, 2);
  assert.ok(out[0].includes('end $$'));
});
t('does not split inside a tagged dollar quote', () => {
  assert.equal(splitStatements('do $body$ a; b $body$; select 2;').length, 2);
});
t('does not split inside comments', () => {
  assert.equal(splitStatements('select 1; -- a; comment\nselect 2;').length, 2);
  assert.equal(splitStatements('select 1; /* a; b */ select 2;').length, 2);
});
t('skips comment-only chunks', () => {
  assert.deepEqual(splitStatements('-- just a note\n;select 1;'), ['select 1']);
});
t('handles a semicolon inside an escaped quote', () => {
  assert.deepEqual(splitStatements("select 'it''s; here';"), ["select 'it''s; here'"]);
});
t('splits the real schema.sql into statements that all parse', () => {
  const sql = readFileSync(resolve(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const stmts = splitStatements(sql);
  assert.ok(stmts.length > 40, `expected many statements, got ${stmts.length}`);
  // Re-joining and re-splitting must be stable, which catches a stray quote.
  assert.equal(splitStatements(stmts.join(';\n') + ';').length, stmts.length);
  // Every statement must start with a SQL keyword once leading comments are
  // removed. A statement starting with anything else is a broken split.
  for (const s of stmts) {
    const code = stripLiterals(s).split('\n')
      .map((l) => l.replace(/^\s*--.*$/, '').trim()).filter(Boolean).join(' ');
    assert.match(code, /^(create|alter|drop|update|insert|select|grant|revoke|do|comment|begin)\b/i,
      `unexpected statement start: ${code.slice(0, 60)}`);
  }
});
t('no scaffolding placeholders are left in the schema', () => {
  const sql = readFileSync(resolve(ROOT, 'supabase', 'schema.sql'), 'utf8');
  assert.equal(/SCHEMA_PART|PLACEHOLDER_|_PART_\d/.test(sql), false);
});
t('statementPreview shows the first real line', () => {
  assert.equal(statementPreview('  create table t (id int);'), 'create table t (id int);');
  assert.equal(statementPreview('-- comment\ncreate index i on t (a);'), 'create index i on t (a);');
  assert.ok(statementPreview('select ' + 'x'.repeat(200)).length <= 70);
});



console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ', all good'}\n`);
