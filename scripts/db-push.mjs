#!/usr/bin/env node
/**
 * Applies supabase/schema.sql to the live project from the terminal.
 *
 *   npm run db:push            apply the schema
 *   npm run db:push -- --dry   show what would run, change nothing
 *
 * Uses the Supabase Management API, so nothing has to be installed: no psql,
 * no Docker, no Supabase CLI. Just Node and a personal access token.
 *
 * WHY THIS IS BETTER THAN PASTING INTO THE SQL EDITOR
 *   - It splits the file into statements and applies them one at a time, so a
 *     failure names the actual statement instead of "line 300".
 *   - It runs the same static checks as `npm run verify` first, so obvious
 *     mistakes never reach the database.
 *   - It is repeatable and safe to re-run: every statement is idempotent.
 *
 * THE TOKEN IS POWERFUL
 *   A personal access token bypasses row level security entirely and can read
 *   and delete everything in the project, including auth.users. It belongs in
 *   .env, which is git-ignored, and nowhere else.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, loadEnvFile, isPlaceholder } from "./lib/env.mjs";
import {
  splitStatements,
  statementPreview,
  analyzeSchema,
} from "./lib/sql-lint.mjs";

const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => {
  console.log(`  \u2717 ${m}`);
  process.exitCode = 1;
};
const warn = (m) => console.log(`  ! ${m}`);
const info = (m) => console.log(`    ${m}`);
// Note: never call process.exit() while an HTTP request may still be in
// flight. On Windows it aborts the Node runtime with
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)". Set the exit code
// and return instead, and let the process end on its own.
const stop = (m) => {
  console.log(`\nStopped \u2014 ${m}\n`);
  process.exitCode = 1;
  throw new StopError(m);
};
class StopError extends Error {}
// Swallow it: the reason has already been printed, so a stack trace is noise.
process.on("uncaughtException", (e) => {
  if (e instanceof StopError) {
    process.exitCode = 1;
    return;
  }
  console.error(e);
  process.exitCode = 1;
});

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry") || args.has("-n");
const FILE = resolve(ROOT, "supabase", "schema.sql");

console.log("\nMana Raktha Datha \u2014 apply schema\n");

// 1. Credentials -------------------------------------------------------------
console.log("1. Credentials");
const env = loadEnvFile();
const token = (env.SUPABASE_ACCESS_TOKEN || "").trim();
// The project ref is the subdomain of the project URL, which is all the
// Management API needs to address the project.
const ref =
  (env.SUPABASE_URL || "")
    .trim()
    .match(/https:\/\/([a-z0-9-]+)\.supabase\./i)?.[1] || "";

if (!ref)
  stop(
    "SUPABASE_URL is missing from .env, so the project cannot be identified.",
  );
// isPlaceholder catches a freshly copied .env.example, which otherwise looks
// like a real token and produces a confusing "JWT could not be decoded".
if (isPlaceholder(token)) {
  bad("SUPABASE_ACCESS_TOKEN is still a placeholder in .env.");
  console.log("");
  console.log("To create a real one:");
  console.log("  1. Open https://supabase.com/dashboard/account/tokens");
  console.log('  2. Generate a new token, name it "mana-raktha-datha"');
  console.log("  3. Copy it (it starts with sbp_)");
  console.log("  4. Paste it into .env as SUPABASE_ACCESS_TOKEN=...");
  console.log("");
  console.log("The token lives in .env, which is git-ignored.");
  console.log("");
  throw new StopError("no access token");
}
if (!/^sbp_/.test(token))
  warn(
    "the token does not start with sbp_ - personal access tokens usually do.",
  );
ok(`Project ref ${ref}`);
ok("Access token present");

// 2. Parse the file ----------------------------------------------------------
console.log("\n2. Reading supabase/schema.sql");
let sql = "";
try {
  sql = readFileSync(FILE, "utf8");
} catch {
  stop("supabase/schema.sql could not be read.");
}
const statements = splitStatements(sql);
ok(`${statements.length} statements parsed`);

// 3. Static checks before touching the database -------------------------------
console.log("\n3. Static checks");
const { problems } = analyzeSchema(sql);
if (problems.length) {
  for (const p of problems) bad(p);
  stop(
    "the file did not pass its own checks, so nothing was sent to the database.",
  );
}
ok("balanced quotes, triggers and policies all resolve");

if (DRY) {
  console.log("\n--dry run: nothing was sent.\n");
  console.log("Statements that would run:\n");
  statements.forEach((s, i) =>
    console.log(`  ${String(i + 1).padStart(3)}. ${statementPreview(s)}`),
  );
  console.log(
    `\n${statements.length} statements. Re-run without --dry to apply.\n`,
  );
  process.exit(0);
}

// 4. Apply ------------------------------------------------------------------
console.log("\n4. Applying to Supabase");
const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;
let applied = 0;

for (const [i, stmt] of statements.entries()) {
  const label = statementPreview(stmt, 58);
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: stmt }),
    });
  } catch (e) {
    stop(`the connection to the Management API failed (${e.message}).`);
  }

  if (res.ok) {
    applied++;
    // Print the interesting ones; 68 lines of "create table" is just noise.
    if (
      /^(create table|create or replace function|enable row)/i.test(
        stmt.trim(),
      ) ||
      /\brevoke\b|\bgrant\b/i.test(stmt)
    ) {
      console.log(`  \u2713 ${i + 1}/${statements.length}  ${label}`);
    } else {
      process.stdout.write(".");
    }
  } else {
    process.stdout.write("\n");
    bad(`statement ${i + 1} of ${statements.length} was rejected`);
    info(label);
    const body = await res.text().catch(() => "");
    let detail = body;
    try {
      const j = JSON.parse(body);
      detail = j.message || j.error_description || j.error || body;
    } catch {
      /* not JSON, so show the raw text */
    }
    console.log("");
    console.log("  Supabase said:\n");
    console.log(
      String(detail)
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n"),
    );
    console.log("");
    console.log(
      "Nothing after this statement was applied. Fix the line above, then",
    );
    console.log(
      "run `npm run db:push` again - earlier statements are idempotent and",
    );
    console.log("will simply re-run.");
    console.log("");
    // Setting the exit code and breaking, rather than process.exit(): exiting
    // while a fetch socket is still open aborts the Node runtime on Windows.
    process.exitCode = 1;
    break;
  }
}
process.stdout.write("\n");
ok(`${applied} of ${statements.length} statements applied`);

// A failed statement means the counts will not add up; stop before the
// verification query, which would report misleading "table missing" errors.
if (applied !== statements.length)
  throw new StopError("some statements failed");

// 5. Confirm the important objects exist -------------------------------------
console.log("\n5. Verifying");
const probe = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    query: `select
      (select count(*) from pg_tables where schemaname = 'public'
        and tablename in ('profiles','reports','reveals','requests')) as tables,
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
        and p.proname in ('search_donors','reveal_phone','make_first_admin','is_admin')) as funcs,
      (select count(*) from pg_policies where schemaname = 'public') as policies`,
  }),
});
if (!probe.ok) {
  warn(
    "could not run the verification query (the schema itself is still applied).",
  );
} else {
  const j = await probe.json().catch(() => null);
  const row = Array.isArray(j) ? j[0] : j;
  const t = Number(row?.tables ?? 0),
    f = Number(row?.funcs ?? 0),
    p = Number(row?.policies ?? 0);
  if (t === 4) ok("all 4 tables exist");
  else bad(`only ${t} of 4 tables exist`);
  if (f >= 4) ok(`${f} key functions exist`);
  else bad(`only ${f} key functions exist`);
  ok(`${p} row level security policies active`);
  if (p < 9)
    warn("fewer policies than expected - check that the RLS section ran.");
}

console.log("\n" + "-".repeat(60));
console.log("RESULT: schema applied.\n");
console.log("Next:");
console.log("  1. npm run check      confirm from the anon key's side");
console.log("  2. Register on the site, then in the SQL Editor run:");
console.log(
  "       select public.make_first_admin('" +
    (env.ADMIN_EMAIL || "you@example.com").trim() +
    "');",
);
console.log("  3. npm run email:push  apply Gmail SMTP + the OTP email template\n");
console.log("     (docs/EMAIL-OTP.md explains the App Password)\n");

ok("balanced quotes, triggers and policies all resolve");

if (DRY) {
  console.log("\n--dry run: nothing was sent.\n");
  console.log("Statements that would run:\n");
  statements.forEach((s, i) =>
    console.log(`  ${String(i + 1).padStart(3)}. ${statementPreview(s)}`),
  );
  console.log(
    `\n${statements.length} statements. Re-run without --dry to apply.\n`,
  );
  process.exit(0);
}

// DB_PUSH_PART_2
