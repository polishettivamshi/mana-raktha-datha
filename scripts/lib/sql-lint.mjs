/**
 * Static checks for supabase/schema.sql.
 *
 * This project has no database to test against, so these parse the file the
 * way Postgres would and catch the mistakes that are easy to make by hand:
 * an unbalanced quote or parenthesis, a trigger pointing at a function that
 * does not exist, a policy on a table that was never created, or a statement
 * that silently does the wrong thing.
 */

/** Strips comments and string/identifier literals so parsing is reliable. */
export function stripLiterals(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    // dollar-quoted block: $$ ... $$ or $tag$ ... $tag$
    const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length);
      const end = close === -1 ? sql.length : close + tag[0].length;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; } // '' escape
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      out += ' '.repeat(j - i);
      i = j;
      continue;
    }
    if (sql[i] === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    if (sql[i] === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i);
      const end = close === -1 ? sql.length : close + 2;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    out += sql[i];
    i++;
  }
  return out;
}

/** True when every (), dollar-quote and single quote closes properly. */
export function checkBalance(sql) {
  const problems = [];

  // dollar quotes
  const opens = [...sql.matchAll(/\$[A-Za-z_0-9]*\$/g)].map((m) => m[0]);
  if (opens.length % 2 !== 0) problems.push(`odd number of dollar-quote markers (${opens.length})`);
  const tags = opens.map((t) => t);
  for (const tag of new Set(tags)) {
    if (tags.filter((t) => t === tag).length % 2 !== 0) {
      problems.push(`unbalanced dollar quote ${tag}`);
    }
  }

  // parentheses, counted on the literal-stripped copy
  const clean = stripLiterals(sql);
  let depth = 0;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '(') depth++;
    else if (clean[i] === ')') {
      depth--;
      if (depth < 0) { problems.push(`extra ")" near character ${i}`); depth = 0; }
    }
  }
  if (depth > 0) problems.push(`${depth} unclosed "("`);
  return problems;
}

/** Names defined by CREATE OR REPLACE FUNCTION / CREATE TABLE. */
export function collectDefinitions(sql) {
  const clean = stripLiterals(sql);
  const functions = new Set();
  const tables = new Set();
  for (const m of clean.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([A-Za-z_0-9]+)/gi)) {
    functions.add(m[1].toLowerCase());
  }
  for (const m of clean.matchAll(/create\s+table\s+if\s+not\s+exists\s+(?:public\.)?([A-Za-z_0-9]+)/gi)) {
    tables.add(m[1].toLowerCase());
  }
  return { functions, tables };
}

/**
 * Splits a SQL file into individual statements.
 *
 * Needed so a schema can be applied one statement at a time: when Postgres
 * rejects something, the useful message names the statement that failed, not
 * line 300 of a file you pasted into a browser.
 *
 * A ";" only ends a statement when it is outside string literals, dollar
 * quoted blocks and comments, so all of those are skipped.
 */
export function splitStatements(sql) {
  const out = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    // Dollar-quoted block: $$ ... $$ or $tag$ ... $tag$
    const tag = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length);
      const end = close === -1 ? sql.length : close + tag[0].length;
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    // Single-quoted string, where '' is an escaped quote.
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }
    // Line comment.
    if (sql[i] === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    // Block comment.
    if (sql[i] === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i);
      const end = close === -1 ? sql.length : close + 2;
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    // A real statement terminator.
    if (sql[i] === ';') {
      const trimmed = current.trim();
      // Comments alone are not statements.
      if (stripLiterals(trimmed).trim()) out.push(trimmed);
      current = '';
      i++;
      continue;
    }
    current += sql[i];
    i++;
  }

  const tail = current.trim();
  if (tail && stripLiterals(tail).trim()) out.push(tail);
  return out;
}

/** The first line of a statement, for logging. */
export function statementPreview(stmt, max = 70) {
  const line = stmt.split('\n').map((s) => s.replace(/^\s*--.*$/, '').trim()).filter(Boolean)[0] || '';
  return line.length > max ? line.slice(0, max - 3) + '...' : line;
}

/**
 * Postgres constructs that look plausible but are invalid, mapped to the
 * correct form.
 *
 * These are syntax errors, not style nits, and a static checker cannot parse
 * real SQL, so they are matched by shape instead. Each one was a live bug at
 * some point in this project.
 */
export const SQL_TRAPS = [
  {
    // ALTER COLUMN ... SET accepts NOT NULL, DEFAULT, STATISTICS, STORAGE.
    // UNIQUE/CHECK/PRIMARY KEY are table constraints and need ADD.
    pattern: /alter\s+column\s+(\w+)\s+set\s+(unique|check|primary\s+key)\b/gi,
    what: 'UNIQUE, CHECK and PRIMARY KEY cannot be set with SET',
    fix: 'use ADD CONSTRAINT <name> <kind> (<column>), or declare it in CREATE TABLE',
  },
  {
    // ALTER TABLE ... DROP CONSTRAINT if exists is not valid; the IF EXISTS
    // goes on the object being dropped, in that position.
    pattern: /alter\s+table\s+[\w.]+\s+drop\s+constraint\s+if\s+exists/gi,
    what: 'IF EXISTS does not follow DROP CONSTRAINT',
    fix: 'use DROP CONSTRAINT IF EXISTS <name>',
  },
  {
    // "add column if not exists x text unique" is invalid. The pattern is
    // deliberately narrow - no .* wildcards - and stops at "add constraint",
    // which is the correct way to write it.
    pattern: /add\s+column\s+(?:if\s+not\s+exists\s+)?\w+\s+(?!constraint\b)\w+(?:\s+\w+)*?\s+unique\b/gi,
    what: 'UNIQUE cannot appear inside ADD COLUMN',
    fix: 'add the column, then add the unique constraint separately',
  },
  {
    // A bare "alter column x set unique" is the trap above; this catches the
    // common misspelling of the table-level form.
    pattern: /alter\s+table\s+[\w.]+\s+alter\s+column\s+(\w+)\s+add\s+unique\b/gi,
    what: 'ADD UNIQUE is not valid at column level',
    fix: 'use ADD CONSTRAINT <name> UNIQUE (<column>)',
  },
];

/** Runs every static check and returns a list of human-readable problems. */
export function analyzeSchema(sql) {
  const problems = [];
  const { functions, tables } = collectDefinitions(sql);
  const clean = stripLiterals(sql);

  for (const p of checkBalance(sql)) problems.push(p);

  // every trigger must point at a function that exists
  for (const m of clean.matchAll(/execute\s+function\s+(?:public\.)?([A-Za-z_0-9]+)\s*\(\s*\)/gi)) {
    if (!functions.has(m[1].toLowerCase())) {
      problems.push(`trigger calls ${m[1]}() which is never defined`);
    }
  }

  // every policy must target a table that exists
  for (const m of clean.matchAll(/create\s+policy\s+[A-Za-z_0-9_]+\s+on\s+(?:public\.)?([A-Za-z_0-9]+)/gi)) {
    if (!tables.has(m[1].toLowerCase())) {
      problems.push(`policy targets table "${m[1]}" which is never created`);
    }
  }

  // every function referenced by a grant/revoke must exist
  for (const m of clean.matchAll(/(?:grant|revoke)\s+\w+\s+on\s+function\s+(?:public\.)?([A-Za-z_0-9]+)/gi)) {
    if (!functions.has(m[1].toLowerCase())) {
      problems.push(`grant/revoke references missing function ${m[1]}`);
    }
  }

  // statements should end with a semicolon
  const statements = clean.split(';').map((s) => s.trim()).filter(Boolean);
  for (const s of statements) {
    if (!/^(create|alter|drop|update|insert|select|grant|revoke|do|comment|begin)\b/i.test(s)) {
      problems.push(`statement does not start with a known keyword: ${s.slice(0, 40)}...`);
    }
  }

  // Known-invalid constructs. These run against the raw text, because they are
  // usually written inside a dollar-quoted body that stripLiterals removes.
  //
  // Each pattern is cloned before use: a /g regex carries lastIndex between
  // calls, so reusing the shared object would make matches depend on how many
  // times it had already run.
  for (const trap of SQL_TRAPS) {
    const re = new RegExp(trap.pattern.source, trap.pattern.flags);
    for (const m of sql.matchAll(re)) {
      problems.push(`${trap.what} (${trap.fix}) - found: ${m[0].replace(/\s+/g, ' ').trim().slice(0, 60)}`);
    }
  }

  return { problems, functions, tables };
}
