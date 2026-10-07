#!/usr/bin/env node
/**
 * End-to-end connection check against the real Supabase project.
 *
 *   npm run check
 *
 * Walks the same path the browser takes and reports PASS / FAIL / WARN for
 * each step, so you know exactly what is broken without opening dev tools.
 * Uses only the public anon key, so it proves what a visitor can reach.
 */
import {
  resolveCredentials,
  isValidSupabaseUrl,
  looksLikeAnonKey,
  isPlaceholder,
  loadEnvFile,
  keyRole,
  isServiceRoleKey,
} from "./lib/env.mjs";

const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => {
  console.log(`  \u2717 ${m}`);
  process.exitCode = 1;
};
const warn = (m) => console.log(`  ! ${m}`);

const stop = (m) => {
  console.log(`\nStopped \u2014 ${m}\n`);
  process.exit(1);
};

console.log("\nMana Raktha Datha \u2014 Supabase connection check\n");

const { url, key, source } = resolveCredentials();

// 1. Credentials -------------------------------------------------------------
console.log("1. Credentials");
if (source === "none")
  stop(
    "no .env or js/env.js found. Run `npm run setup` and fill in your keys.",
  );
console.log(`  reading from ${source}`);
if (isPlaceholder(url) || isPlaceholder(key))
  stop("keys are still placeholders. Edit .env with your real values.");
if (!isValidSupabaseUrl(url)) stop(`invalid project URL: ${url}`);
ok(`Project URL  ${url}`);

if (isServiceRoleKey(key)) {
  bad("This is the service_role key, which bypasses all row level security.");
  stop("replace it with the anon public key before going live.");
}
ok(
  `Anon key      ${keyRole(key) || "anon (JWT, role not stated)"}, ${key.length} chars`,
);

const H = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

// 2. Project reachable -------------------------------------------------------
console.log("\n2. Project reachable");
let alive = false;
try {
  const r = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
  });
  if (!r.ok)
    bad(
      `Auth API returned HTTP ${r.status}. Check the URL and that the project is not paused.`,
    );
  else {
    alive = true;
    ok(`Auth API responding (HTTP ${r.status})`);
    const s = await r.json().catch(() => ({}));
    if (s?.autoconfirm === true)
      warn("Email confirmation is OFF. Anyone can sign up as any address.");
    if (s?.mailer_autoconfirm === false)
      warn(
        "Email confirmation is ON. New users must confirm before logging in.",
      );
  }
} catch (e) {
  bad(`Cannot reach ${url} \u2014 ${e.message}`);
}
if (!alive) stop("the project itself is unreachable.");

// 3. Anon key accepted -------------------------------------------------------
console.log("\n3. Anon key permissions");
// PostgREST returns 200 with an empty array when RLS filters every row out,
// so an empty array means "working correctly", not "readable". Only a
// non-empty result here means data is leaking to logged-out visitors.
const restNoJwt = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
  headers: { apikey: key },
}).catch(() => null);
if (!restNoJwt) warn("Could not test the anon key (network error).");
else if (restNoJwt.status === 401)
  bad(
    "The anon key was rejected (401). Copy it again from Project Settings > API.",
  );
else if (restNoJwt.ok) {
  const rows = await restNoJwt.json().catch(() => null);
  if (Array.isArray(rows)) {
    if (rows.length === 0)
      ok(
        "Anon key accepted; profiles returns no rows without a session (RLS working)",
      );
    else
      bad(
        `profiles returned ${rows.length} row(s) with no session. Row level security is NOT protecting your data.`,
      );
  } else {
    warn(
      `Unexpected response body for a logged-out read (HTTP ${restNoJwt.status}).`,
    );
  }
} else if ([403, 404, 400].includes(restNoJwt.status)) {
  ok(
    `Anon key accepted; read correctly blocked without a session (HTTP ${restNoJwt.status})`,
  );
} else {
  warn(`Unexpected logged-out read response (HTTP ${restNoJwt.status}).`);
}

// 4. Tables and schema -------------------------------------------------------
console.log("\n4. Database schema");
for (const t of ["profiles", "reports", "reveals", "requests"]) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
    headers: H,
  }).catch(() => null);
  if (!r) {
    warn(`Could not test table "${t}" (network error).`);
    continue;
  }
  if (r.ok) ok(`Table "${t}" exists`);
  else if ([404, 400].includes(r.status))
    bad(
      `Table "${t}" is missing \u2014 run supabase/schema.sql in the SQL Editor.`,
    );
  else warn(`Table "${t}" returned HTTP ${r.status}.`);
}

// 5. RPC functions -----------------------------------------------------------
console.log("\n5. Search and phone-reveal functions");
for (const fn of ["search_donors", "reveal_phone"]) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: H,
    body: "{}",
  }).catch(() => null);
  if (!r) {
    warn(`Could not test "${fn}" (network error).`);
    continue;
  }
  const text = await r.text().catch(() => "");
  if (r.ok)
    bad(
      `"${fn}" ran while logged out. It must only be granted to authenticated users.`,
    );
  else if (
    r.status === 404 ||
    /could not find the function|not found/i.test(text)
  )
    bad(`Function "${fn}" is missing \u2014 run supabase/schema.sql.`);
  else ok(`"${fn}" exists and correctly refuses logged-out callers`);
}

// 6. Email delivery ----------------------------------------------------------
console.log("\n6. Email codes");
// What the public settings do NOT report is the mailer itself: no smtp
// block, no OTP length (checked against api.supabase.com). So this reads the
// confirm-email flag here, then lets the send attempt below decide whether
// custom SMTP actually works - the one thing a visitor can feel. Host,
// template and OTP rules are verified by `npm run email:push`.
try {
  const r = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
  });
  const s = r.ok ? await r.json().catch(() => ({})) : {};
  if (s.mailer_autoconfirm === true)
    ok("Confirm email is OFF (correct for OTP sign-in)");
  else if (s.mailer_autoconfirm === false)
    warn(
      "Confirm email is ON. Every new user needs a second click. Turn it off when using OTP codes.",
    );
} catch (e) {
  warn(`Could not read the mailer settings \u2014 ${e.message}`);
}

// A real send attempt to a fixed throwaway address, to prove the path end
// to end. create_user is omitted on purpose: newer GoTrue rejects
// create_user:false with a misleading otp_disabled error before ever
// touching the mailer. The address is fixed so the 60-second limit applies
// to one row instead of minting a new one every run.
try {
  const r = await fetch(`${url}/auth/v1/otp`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ email: "probe@example.invalid" }),
  });
  if (r.ok) {
    ok("Custom SMTP accepted a code send (the public signal that it works)");
    const env = loadEnvFile();
    if (env.ADMIN_EMAIL)
      warn(
        `Now send a real code to ${env.ADMIN_EMAIL} and confirm it arrives.`,
      );
    else
      warn(
        "Add ADMIN_EMAIL to .env to have this script tell you which address to test with.",
      );
  } else if (r.status === 429) {
    warn("Rate limited (429). Wait a minute and run this again.");
  } else {
    const body = (await r.text().catch(() => "")).slice(0, 200);
    if (r.status === 500 || /smtp|sending|connection|tls/i.test(body)) {
      bad(
        "The send path is wired but the mailer could not send - usually a wrong or revoked Gmail App Password.",
      );
      warn("npm run email:check tests the Gmail login directly.");
    } else if (/not authorized/i.test(body)) {
      bad("NO custom SMTP - Supabase refuses every address outside the team.");
      warn("Apply the Gmail settings: npm run email:push (docs/EMAIL-OTP.md).");
    } else {
      warn(`Send endpoint returned HTTP ${r.status}: ${body}`);
    }
  }
} catch (e) {
  warn(`Could not reach the send endpoint \u2014 ${e.message}`);
}

// Summary --------------------------------------------------------------------
console.log("\n" + "-".repeat(60));
console.log(
  process.exitCode
    ? "RESULT: some checks failed. See the lines marked with a cross above.\n"
    : "RESULT: Supabase is connected and the schema looks correct.\n",
);
console.log("Next steps:");
console.log(
  "  1. npm run dev                 serve the site at http://localhost:5173",
);
console.log(
  "  2. Register on the site        confirm the 6-digit code arrives",
);
console.log(
  "  3. docs/SETUP.md section 5     promote your own account to admin",
);
console.log("");
