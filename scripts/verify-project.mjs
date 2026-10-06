#!/usr/bin/env node
/**
 * Structural check of the project itself - no network needed.
 *
 *   npm run verify
 *
 * Catches the mistakes that are easy to make in a no-build project: a file
 * referenced by the HTML that does not exist, a missing image, a broken
 * relative path, or a secret accidentally committed to the repository.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ROOT, ENV_FILE, ENV_JS_FILE } from "./lib/env.mjs";
import { analyzeSchema } from "./lib/sql-lint.mjs";

const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => {
  console.log(`  \u2717 ${m}`);
  process.exitCode = 1;
};
const warn = (m) => console.log(`  ! ${m}`);

console.log("\nMana Raktha Datha \u2014 project structure check\n");

// 1. Required files ----------------------------------------------------------
console.log("1. Required files");
const REQUIRED = [
  "index.html",
  "404.html",
  "css/styles.css",
  "js/config.js",
  "js/app.js",
  "site.webmanifest",
  "robots.txt",
  "_headers",
  "README.md",
  "package.json",
  ".gitignore",
  ".editorconfig",
  ".env.example",
  "supabase/schema.sql",
  "supabase/email-template-otp.html",
  "scripts/check-smtp.mjs",
  "scripts/db-push.mjs",
  "scripts/lib/sql-lint.mjs",
  "docs/SETUP.md",
  "docs/EMAIL-OTP.md",
  "docs/LAUNCH-CHECKLIST.md",
  "images/logo.webp",
  "images/hero.webp",
  "images/icons/icon-192.png",
  "images/icons/icon-512.png",
  "scripts/dev.mjs",
  "scripts/build-env.mjs",
  "scripts/check-supabase.mjs",
  "scripts/verify-project.mjs",
  "scripts/lib/env.mjs",
  "js/states.js",
  "server/index.js",
  "server/app.js",
  "server/routes/health.js",
  "server/app.test.mjs",
  ".github/workflows/keep-alive.yml",
];
for (const f of REQUIRED) {
  const p = resolve(ROOT, f);
  if (!existsSync(p)) bad(`Missing: ${f}`);
  else if (statSync(p).size === 0) bad(`Empty file: ${f}`);
}
ok(`${REQUIRED.length} required files checked`);

// 2. Files referenced by index.html exist --------------------------------------
console.log("\n2. Files referenced by index.html");
const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
const refs = [
  ...html.matchAll(
    /(?:src|href)="([^"#:]+\.(?:js|css|png|webp|webmanifest|ico))"/g,
  ),
]
  .map((m) => m[1])
  .filter((p) => !p.startsWith("http"));
let missing = 0;
for (const r of [...new Set(refs)]) {
  if (r === "js/env.js" && !existsSync(resolve(ROOT, r))) {
    warn("js/env.js not generated yet (run `npm run setup`)");
    continue;
  }
  if (!existsSync(resolve(ROOT, r))) {
    bad(`index.html references missing file: ${r}`);
    missing++;
  }
}
if (!missing) ok(`${new Set(refs).size} local references resolve`);

// 2b. The OTP email template -------------------------------------------------
console.log("\n2b. Email template");
const tplPath = resolve(ROOT, "supabase", "email-template-otp.html");
if (!existsSync(tplPath)) bad("supabase/email-template-otp.html is missing.");
else {
  const tpl = readFileSync(tplPath, "utf8");
  if (tpl.includes("{{ .Token }}"))
    ok("contains the {{ .Token }} placeholder for the 6-digit code");
  else bad("no {{ .Token }} placeholder, so Supabase cannot inject the code.");
  if (tpl.includes("10 minutes")) ok("states the 10-minute expiry");
  else warn("does not mention the 10-minute expiry.");
  for (const [hex, label] of [
    ["#B3121F", "brand red"],
    ["#FFF1F2", "blush"],
    ["#2A1215", "ink"],
  ]) {
    if (tpl.toUpperCase().includes(hex)) ok(`uses ${label} ${hex}`);
    else warn(`does not use ${label} ${hex}`);
  }
  // Outlook ignores <style>, flexbox and grid, so the layout must be tables.
  if (!/<table/i.test(tpl))
    bad("no <table> layout, so Outlook will render it badly.");
  else if (/display:\s*(flex|grid)/i.test(tpl))
    bad("uses flexbox or grid, which Outlook ignores.");
  else ok("table-based layout with inline styles (Outlook safe)");
}

// 3. Every image referenced by config.js exists ---------------------------------
console.log("\n3. Images referenced by js/config.js");
const config = readFileSync(resolve(ROOT, "js/config.js"), "utf8");
const imgBlock = config.match(/const IMG=\{(.*?)\}/s)?.[1] || "";
const imgPaths = [...imgBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
let badImgs = 0;
for (const p of imgPaths) {
  if (!existsSync(resolve(ROOT, p))) {
    bad(`js/config.js points at a missing image: ${p}`);
    badImgs++;
  }
}
if (!badImgs) ok(`${imgPaths.length} images present`);

// 4. CSS custom properties match ----------------------------------------------
console.log("\n4. Stylesheet");
const css = readFileSync(resolve(ROOT, "css/styles.css"), "utf8");
for (const v of ["--red", "--bg", "--ink", "--line"]) {
  if (!css.includes(`${v}:`)) bad(`css/styles.css does not define ${v}`);
}
if (css.includes("--hero)")) ok("hero background variable is wired up");
if (!/prefers-reduced-motion/.test(css))
  warn("No prefers-reduced-motion rule found (accessibility).");
else ok("reduced-motion animations are respected");

// 5. Secrets must not be tracked by git ----------------------------------------
console.log("\n5. Secrets");
const tracked = execFileSync("git", ["ls-files"], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
for (const f of [".env", "js/env.js"]) {
  if (tracked.includes(f))
    bad(`${f} is tracked by git. Run: git rm --cached ${f}`);
}
ok(".env and js/env.js are not tracked");

if (
  /SUPABASE_ANON_KEY\s*=\s*['"](eyJ[A-Za-z0-9_-]{10}|sb_publishable_[A-Za-z0-9]{10})/.test(
    config,
  )
) {
  bad("A real Supabase key is hard-coded in js/config.js. Move it to .env.");
} else {
  ok("No hard-coded keys in js/config.js");
}

// 6. Schema sanity ------------------------------------------------------------
console.log("\n6. Database schema");
const sql = readFileSync(resolve(ROOT, "supabase/schema.sql"), "utf8");
const needs = [
  ["create table if not exists public.profiles", "profiles table"],
  ["create table if not exists public.requests", "requests table"],
  ["create table if not exists public.reports", "reports table"],
  ["create table if not exists public.reveals", "reveals table"],
  ["enable row level security", "row level security"],
  ["create or replace function public.search_donors", "search_donors()"],
  ["create or replace function public.reveal_phone", "reveal_phone()"],
  ["revoke all on function public.reveal_phone", "revoke on reveal_phone()"],
  ["grant  execute on function public.reveal_phone", "grant on reveal_phone()"],
  ["drop policy if exists", "idempotent policies"],
  ["drop trigger if exists", "idempotent triggers"],
  ["create index if not exists", "indexes"],
  ["make_first_admin", "first-admin function"],
  ["state         text not null", "state column on profiles"],
  ["p_state text default null", "state search parameter"],
];
for (const [needle, label] of needs) {
  if (!sql.includes(needle)) bad(`supabase/schema.sql is missing ${label}`);
}
ok(`${needs.length} schema requirements present`);

// A trigger that reverts is_admin runs on the very UPDATE that promotes the
// first admin, so the promotion has to raise a bypass flag first.
if (/set_config\('mrd\.admin_bypass', 'on'/.test(sql))
  ok("make_first_admin can bypass the admin-lock trigger");
else
  bad(
    "make_first_admin cannot bypass profiles_lock, so the first admin would never be promoted.",
  );
if (/current_user in \('postgres', 'supabase_admin'\)/.test(sql))
  ok("SQL Editor can promote an admin directly");
else
  bad(
    "Pasting an UPDATE into the SQL Editor would be silently reverted by profiles_lock.",
  );

// reveal_phone must not be able to hand back your own number.
const reveal =
  sql.match(
    /create or replace function public\.reveal_phone[\s\S]*?end \$\$;/,
  )?.[0] || "";
if (/cannot reveal your own number/.test(reveal))
  ok("reveal_phone refuses to return your own number");
else bad("reveal_phone has no self-reveal guard.");

// Parse the whole file: balanced quotes, triggers that point at real
// functions, policies on real tables.
const { problems, functions, tables } = analyzeSchema(sql);
for (const p of problems) bad(`schema.sql: ${p}`);
if (!problems.length)
  ok(`SQL parses cleanly (${tables.size} tables, ${functions.size} functions)`);

// 7. package.json scripts ------------------------------------------------------
console.log("\n7. npm scripts");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
for (const s of [
  "setup",
  "dev",
  "check",
  "verify",
  "test",
  "db:push",
  "email:check",
  "dev:api",
]) {
  if (!pkg.scripts?.[s]) bad(`package.json has no "${s}" script`);
}
ok("all scripts defined");

// 8. Local setup state ---------------------------------------------------------
console.log("\n8. Local setup state");
if (!existsSync(ENV_FILE))
  warn("No .env yet - run `npm run setup` and fill in your keys.");
else ok(".env exists");
if (!existsSync(ENV_JS_FILE)) warn("No js/env.js yet - run `npm run setup`.");
else ok("js/env.js exists");

// Summary ----------------------------------------------------------------------
console.log("\n" + "-".repeat(60));
console.log(
  process.exitCode
    ? "RESULT: fix the lines marked with a cross above.\n"
    : "RESULT: project structure is correct.\n",
);
