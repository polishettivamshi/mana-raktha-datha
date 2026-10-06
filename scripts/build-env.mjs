#!/usr/bin/env node
/**
 * Reads `.env` and writes `js/env.js`, the browser-readable config that
 * `js/config.js` consumes. Keeps Supabase keys out of version control.
 *
 *   npm run setup        build js/env.js from .env
 *
 * `js/env.js` is git-ignored on purpose. Run this before `npm run dev` and
 * again before deploying (your host can run it as a build command).
 */
import { writeFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ROOT,
  ENV_FILE,
  ENV_JS_FILE,
  loadEnvFile,
  renderEnvJs,
  isValidSupabaseUrl,
  looksLikeAnonKey,
  isPlaceholder,
  keyRole,
  isServiceRoleKey,
} from "./lib/env.mjs";

const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => console.log(`  \u2717 ${m}`);
const warn = (m) => console.log(`  ! ${m}`);

console.log("\nMana Raktha Datha \u2014 build env\n");

// Step 1: on a deploy host (e.g. Cloudflare Pages) the values come from the
// environment, so only create .env when working locally.
if (!existsSync(ENV_FILE)) {
  const example = resolve(ROOT, ".env.example");
  if (loadEnvFile().SUPABASE_URL) {
    console.log("Using SUPABASE_* environment variables (deploy host).");
  } else if (existsSync(example)) {
    copyFileSync(example, ENV_FILE);
    console.log(
      "Created .env from .env.example. Fill in your Supabase keys, then run this again.\n",
    );
    process.exit(1);
  }
}

const env = loadEnvFile();
const url = (env.SUPABASE_URL || "").trim();
const key = (env.SUPABASE_ANON_KEY || "").trim();

console.log(
  `Reading ${existsSync(ENV_FILE) ? ".env" : "environment variables"}`,
);
let failed = false;

if (isPlaceholder(url) || isPlaceholder(key)) {
  bad("SUPABASE_URL and SUPABASE_ANON_KEY are still placeholders.");
  warn(
    "Supabase > Project Settings > Data API > Project URL / anon public key.",
  );
  failed = true;
} else if (!isValidSupabaseUrl(url)) {
  bad(`SUPABASE_URL does not look like a Supabase URL: "${url}"`);
  warn("Expected something like https://abcdefghijklm.supabase.co");
  failed = true;
} else {
  ok(`Project URL  ${url}`);
}

// Check for the dangerous key FIRST: a service_role key is also a JWT and
// would otherwise pass the format test below.
if (isServiceRoleKey(key)) {
  bad("This is the service_role key. It bypasses all row level security.");
  warn(
    "Use the anon public key instead: Project Settings > Data API > anon public.",
  );
  warn("If you already committed it, rotate it in Supabase immediately.");
  process.exit(1);
}

if (!failed && !looksLikeAnonKey(key)) {
  bad("SUPABASE_ANON_KEY does not look like an anon/publishable key.");
  warn(
    "Never paste the service_role key here \u2014 it bypasses all row level security.",
  );
  failed = true;
} else if (!failed) {
  const role = keyRole(key);
  ok(
    `Anon key      ${role || "anon (JWT, role not stated)"}, ${key.length} chars`,
  );
}

if (failed) {
  console.log(
    "\nNothing was written. Fix .env and run `npm run setup` again.\n",
  );
  process.exit(1);
}

// Step 2: write the browser config.
const from = existsSync(ENV_FILE) ? ".env" : "environment variables";
writeFileSync(
  ENV_JS_FILE,
  renderEnvJs(url, key, from, (env.ADMIN_EMAIL || "").trim()),
  "utf8",
);
ok(`Wrote js/env.js (from ${from})`);
if (env.ADMIN_EMAIL) ok(`Contact email  ${(env.ADMIN_EMAIL || "").trim()}`);

// Step 3: confirm it is ignored by git.
try {
  const { execFileSync } = await import("node:child_process");
  execFileSync("git", ["check-ignore", "-q", "js/env.js"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  ok("js/env.js is git-ignored");
} catch {
  warn(
    "js/env.js is NOT git-ignored \u2014 add it to .gitignore before committing.",
  );
}

console.log(
  "\nNext: `npm run dev` to serve the site locally, `npm run check` to test the connection.\n",
);
