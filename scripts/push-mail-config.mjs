#!/usr/bin/env node
/**
 * Applies the email delivery settings to the live Supabase project: the
 * Gmail SMTP credentials, the OTP email template, and the code rules.
 *
 *   npm run email:push           apply everything
 *   npm run email:push -- --dry  show what would be sent, change nothing
 *
 * Same idea as `npm run db:push`: the Management API does it, so nothing has
 * to be pasted into the dashboard and the values Supabase uses are the same
 * ones `npm run email:check` already tested. What ends up configured:
 *
 *   - Custom SMTP    smtp.gmail.com:587, logged in as SMTP_LOGIN from .env
 *   - From           SMTP_SENDER, displayed as "Mana Raktha Datha"
 *   - The template   supabase/email-template-otp.html, so the mail shows a
 *                    6-digit code ({{ .Token }}) instead of a link
 *   - Code rules     6 digits, 600 seconds, one send per address per minute,
 *                    sign-up confirmation off (docs/EMAIL-OTP.md)
 *
 * THE TOKEN IS POWERFUL
 *   A personal access token can change project-wide settings. It belongs in
 *   .env, which is git-ignored, and nowhere else. The SMTP password is sent
 *   to Supabase - that is the point of this script - and is never printed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, loadEnvFile, isPlaceholder } from "./lib/env.mjs";

const ok = (m) => console.log("  ✓ " + m);
const bad = (m) => {
  console.log("  ✗ " + m);
  process.exitCode = 1;
};
const warn = (m) => console.log("  ! " + m);
// Never call process.exit() while an HTTP request may be in flight - on
// Windows it aborts Node with an assertion. Set the code and throw instead.
class StopError extends Error {}
const stop = (m) => {
  console.log("");
  console.log("Stopped — " + m);
  console.log("");
  throw new StopError(m);
};
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

console.log("");
console.log("Mana Raktha Datha — apply email settings");
console.log("");

// 1. Credentials --------------------------------------------------------------
console.log("1. Credentials");
const env = loadEnvFile();
const token = (env.SUPABASE_ACCESS_TOKEN || "").trim();
// The project ref is the subdomain of the project URL.
const ref = (env.SUPABASE_URL || "")
  .trim()
  .replace("https://", "")
  .split(".")[0];

if (!/^[a-z0-9-]+$/.test(ref || ""))
  stop(
    "SUPABASE_URL is missing or malformed in .env, so the project cannot be identified.",
  );
// isPlaceholder catches a freshly copied .env.example.
if (isPlaceholder(token)) {
  bad("SUPABASE_ACCESS_TOKEN is still a placeholder in .env.");
  console.log("");
  console.log("Create one at https://supabase.com/dashboard/account/tokens");
  console.log('(name it "mana-raktha-datha"; it starts with sbp_) and paste');
  console.log("it into .env. npm run db:push explains the same steps.");
  stop("no token.");
}

const get = (n, d = "") => (env[n] || d).trim();
const host = get("SMTP_HOST", "smtp.gmail.com").toLowerCase();
const port = get("SMTP_PORT", "587");
const login = get("SMTP_LOGIN");
const sender = get("SMTP_SENDER");
const senderName = get("SMTP_SENDER_NAME", "Mana Raktha Datha");
// Google shows App Passwords in groups of four; .env or the Supabase form
// may hold them with spaces. SMTP wants one 16-character string.
const password = get("SMTP_PASSWORD").split(" ").join("");

if (isPlaceholder(login) || isPlaceholder(password))
  stop(
    "SMTP_LOGIN or SMTP_PASSWORD is missing or still a placeholder in .env " +
      "(see .env.example and docs/EMAIL-OTP.md step 1).",
  );
if (host !== "smtp.gmail.com")
  stop('SMTP_HOST is "' + host + '". This project only supports Gmail.');
if (port !== "587")
  stop(
    "SMTP_PORT is " +
      port +
      ". Gmail uses 587 (STARTTLS) - set SMTP_PORT=587 in .env.",
  );
if (!sender || isPlaceholder(sender))
  stop(
    "SMTP_SENDER is missing from .env. Gmail only sends as the account " +
      "itself, so it must equal SMTP_LOGIN.",
  );
if (password.length !== 16)
  warn(
    "A Google App Password is 16 characters; this one has " +
      password.length +
      ".",
  );

ok("Project     " + ref);
ok("Gmail login " + login);
ok("From        " + sender + "  (" + senderName + ")");
ok(
  "Password    ..." +
    password.slice(-4) +
    " (" +
    password.length +
    " chars, spaces removed)",
);

// 2. Email template -----------------------------------------------------------
console.log("");
console.log("2. Email template");
const template = readFileSync(
  resolve(ROOT, "supabase", "email-template-otp.html"),
  "utf8",
);
// The site's form asks for digits (js/app.js calls verifyOtp), so a template
// without {{ .Token }} would mail a clickable link nobody can type in.
if (!template.includes("{{ .Token }}"))
  stop(
    "supabase/email-template-otp.html has no {{ .Token }}, so recipients " +
      "would get a link while the site asks for digits.",
  );
ok("supabase/email-template-otp.html (" + template.length + " chars)");
ok("shows the 6-digit code ({{ .Token }})");

const subject = "Your Mana Raktha Datha code";

// 3. What will be applied -----------------------------------------------------
console.log("");
console.log("3. Settings");
const body = {
  external_email_enabled: true,
  smtp_host: host,
  smtp_port: port,
  smtp_user: login,
  smtp_pass: password,
  smtp_admin_email: sender,
  smtp_sender_name: senderName,
  smtp_max_frequency: 60, // one code per address per minute
  mailer_autoconfirm: true, // sign-up confirmation OFF for the OTP flow
  mailer_otp_exp: 600, // 10 minutes, as the template promises
  mailer_otp_length: 6, // the site renders 6 boxes
  mailer_subjects_magic_link: subject,
  mailer_templates_magic_link_content: template,
};
const rows = [
  ["Enable Custom SMTP", "on"],
  ["SMTP", host + ":" + port + ", user " + login],
  ["Password", "..." + password.slice(-4) + " (never printed in full)"],
  ["Sender", sender + "  (" + senderName + ")"],
  ["One code per", "address per 60 seconds"],
  ["Sign-up confirm", "off (the code already proves the address)"],
  ["Code", "6 digits, valid 600 seconds"],
  ["Subject", subject],
  ["Template", "supabase/email-template-otp.html"],
];
for (const [k, v] of rows) console.log("  " + (k + "  ").padEnd(19) + v);

const endpoint =
  "https://api.supabase.com/v1/projects/" + ref + "/config/auth";

if (DRY) {
  console.log("");
  console.log("--dry run: nothing was sent.");
  console.log("");
} else {
  // 4. Apply ------------------------------------------------------------------
  console.log("");
  console.log("4. Applying");
  const r = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.message || j.error_description || j.error || j.detail || text;
    } catch {
      /* not JSON, so show the raw text */
    }
    console.log("");
    console.log("Supabase said:");
    console.log("    " + detail);
    console.log("");
    stop("the settings were not applied.");
  }
  ok("Supabase accepted the new settings");

  // 5. Read back and verify ---------------------------------------------------
  console.log("");
  console.log("5. Verifying");
  const g = await fetch(endpoint, {
    headers: { Authorization: "Bearer " + token },
  });
  const now = g.ok ? await g.json().catch(() => ({})) : {};
  if (!g.ok) warn("could not read the config back (HTTP " + g.status + ").");
  const checks = [
    ["Custom SMTP is enabled", now.external_email_enabled === true],
    [
      "Host " + host + ":" + port,
      now.smtp_host === host && String(now.smtp_port) === port,
    ],
    ["Login " + login, now.smtp_user === login],
    [
      "From " + sender,
      (now.smtp_admin_email || "").toLowerCase() === sender.toLowerCase(),
    ],
    ["Sender name " + senderName, now.smtp_sender_name === senderName],
    [
      "Password stored",
      typeof now.smtp_pass === "string" && now.smtp_pass.length > 0,
    ],
    ["Rate limit 60s per address", Number(now.smtp_max_frequency) === 60],
    ["Sign-up confirmation off", now.mailer_autoconfirm === true],
    ["Code: 6 digits", now.mailer_otp_length === 6],
    ["Code: 600 seconds", now.mailer_otp_exp === 600],
    ["Subject: " + subject, now.mailer_subjects_magic_link === subject],
    [
      "Template uploaded",
      (now.mailer_templates_magic_link_content || "").trim() ===
        template.trim(),
    ],
  ];
  for (const [label, good] of checks) good ? ok(label) : bad(label);

  console.log("");
  console.log("-".repeat(60));
  console.log(
    process.exitCode
      ? "RESULT: some settings did not apply. See the lines marked above."
      : "RESULT: email delivery configured - Gmail sends the 6-digit codes.",
  );
  console.log("");
  console.log("Next:");
  console.log("  1. npm run email:check   confirm the Gmail login");
  console.log("  2. npm run check         probe the send path from the anon key");
  console.log("  3. Register on the site  the code arrives from " + sender);
  console.log("");
}

