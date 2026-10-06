/**
 * Tests the Gmail SMTP credentials without sending an email. Gmail is the
 * only supported provider; the values come from SMTP_* in .env
 * (docs/EMAIL-OTP.md explains how to create the App Password).
 *
 *   npm run email:check
 *
 * Why bother: pasting a wrong password into the Supabase dashboard only
 * produces an unhelpful "email not sent" message. This opens a real
 * connection to smtp.gmail.com and walks the handshake, so you know the
 * port, login and password are correct before touching Supabase.
 *
 * Nothing is sent and no account state changes. It authenticates, then closes
 * politely with QUIT.
 */
import net from "node:net";
import tls from "node:tls";
import { loadEnvFile, isPlaceholder } from "./lib/env.mjs";

const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => {
  console.log(`  \u2717 ${m}`);
  process.exitCode = 1;
};
const warn = (m) => console.log(`  ! ${m}`);
const info = (m) => console.log(`    ${m}`);

console.log("\nMana Raktha Datha \u2014 Gmail SMTP check\n");

const env = loadEnvFile();
// Gmail is the only supported provider (docs/EMAIL-OTP.md).
const get = (n, d = "") => (env[n] || d).trim();
const host = get("SMTP_HOST", "smtp.gmail.com").toLowerCase();
const port = Number(get("SMTP_PORT", "587"));
const login = get("SMTP_LOGIN");
const key = get("SMTP_PASSWORD");
const sender = get("SMTP_SENDER");
const senderName = get("SMTP_SENDER_NAME", "Mana Raktha Datha");

// 1. Credentials present ------------------------------------------------------
console.log("1. Credentials in .env");
if (!login || !key || isPlaceholder(login) || isPlaceholder(key)) {
  bad("SMTP_LOGIN or SMTP_PASSWORD is missing or still a placeholder.");
  console.log(
    "\nAdd them to .env first (see .env.example), then run this again.",
  );
  console.log("The password is a 16-character Google App Password from");
  console.log("myaccount.google.com/apppasswords.\n");
  process.exit(1);
}
if (host !== "smtp.gmail.com") {
  bad(`SMTP_HOST is "${host}". This project only supports Gmail.`);
  console.log("\nSet SMTP_HOST=smtp.gmail.com in .env (see .env.example).\n");
  process.exit(1);
}
if (port !== 587) {
  bad(`SMTP_PORT is ${port}. Gmail uses port 587 (STARTTLS).`);
  console.log("\nSet SMTP_PORT=587 in .env.\n");
  process.exit(1);
}
ok("Provider     Gmail");
ok(`Host         ${host}:${port}`);
ok(`Login        ${login}`);
ok(`Password     ...${key.slice(-6)} (${key.length} chars)`);
if (/\*+/.test(key)) {
  bad(
    "The password contains asterisks: it looks masked or redacted, not a real value.",
  );
  console.log(
    "\nOpen .env and paste the complete 16-character App Password from",
  );
  console.log(
    "myaccount.google.com/apppasswords (never your Google password).\n",
  );
  process.exit(1);
}
if (key.replace(/\s+/g, "").length !== 16)
  warn(
    "A Google App Password is exactly 16 characters; this value is not one.",
  );
else if (/\s/.test(key))
  warn(
    "The password contains spaces — paste it without spaces, in .env and Supabase alike.",
  );
if (!login.includes("@")) warn("The login must be the full Gmail address.");
if (sender) {
  ok(`From address ${sender}`);
  if (sender.toLowerCase() !== login.toLowerCase())
    warn(
      "Gmail only sends as the account itself — set Sender Email equal to SMTP_LOGIN.",
    );
} else warn("SMTP_SENDER is not set. Supabase still needs it.");

// 2. TCP reachability ---------------------------------------------------------
console.log("\n2. Network");
const reachable = await new Promise((resolve) => {
  const s = net.connect({ host, port });
  const done = (v) => {
    s.destroy();
    resolve(v);
  };
  s.setTimeout(15000);
  s.on("connect", () => done(true));
  s.on("timeout", () => done(false));
  s.on("error", () => done(false));
});
if (!reachable) {
  bad(`Cannot open a connection to ${host}:${port}`);
  warn(
    "Check your internet, any firewall or VPN, and that port 587 is not blocked.",
  );
  warn("Some office and campus networks block outbound SMTP entirely.");
  console.log("");
  process.exit(1);
}
ok(`Connected to ${host}:${port}`);

// 3. SMTP conversation -------------------------------------------------------
console.log("\n3. SMTP conversation");

/**
 * One clean state machine over the connection. Each step sends one command
 * and expects one reply, so the TLS upgrade is just another step rather than
 * a second code path with its own reader.
 */
const handshake = await new Promise((resolve) => {
  let socket = net.connect({ host, port });
  let buffer = "";
  let step = "greeting";
  let finished = false;

  const finish = (result) => {
    if (finished) return;
    finished = true;
    try {
      socket.write("QUIT\r\n");
      socket.end();
      socket.destroy();
    } catch {
      /* gone */
    }
    resolve(result);
  };

  /** Handles one complete server reply and sends the next command. */
  const onReply = (reply) => {
    const code = reply.slice(0, 3);
    const b64 = (v) => Buffer.from(v, "utf8").toString("base64") + "\r\n";

    switch (step) {
      case "greeting":
        if (code !== "220")
          return finish({
            ok: false,
            message: `Server did not greet us: ${reply}`,
          });
        step = "ehlo";
        return socket.write("EHLO mana-raktha-datha.local\r\n");

      case "ehlo":
        if (code !== "250")
          return finish({ ok: false, message: `EHLO rejected: ${reply}` });
        // STARTTLS is normally advertised in the first capability line, so the
        // whole reply has to be searched, not just its final line.
        if (!/STARTTLS/i.test(reply)) {
          return finish({
            ok: false,
            message:
              "The server does not advertise STARTTLS, so the key cannot be sent safely.",
          });
        }
        step = "starttls";
        return socket.write("STARTTLS\r\n");

      case "starttls": {
        if (code !== "220")
          return finish({ ok: false, message: `STARTTLS refused: ${reply}` });
        step = "ehlo-tls";
        // Upgrade this same socket, then keep using the same reader. The
        // session must be re-introduced over TLS, so EHLO waits for the
        // handshake to complete - writing it now would go out in clear text.
        const plain = socket;
        plain.removeAllListeners("data");
        const secure = tls.connect({
          socket: plain,
          servername: host,
          rejectUnauthorized: false,
        });
        socket = secure;
        buffer = "";
        socket.on("data", onData);
        socket.on("timeout", () =>
          finish({ ok: false, message: "Timed out during TLS" }),
        );
        socket.on("error", (e) =>
          finish({ ok: false, message: `TLS error: ${e.message}` }),
        );
        secure.on("secureConnect", () => {
          socket.write("EHLO mana-raktha-datha.local\r\n");
        });
        return;
      }

      case "ehlo-tls":
        if (code !== "250")
          return finish({
            ok: false,
            message: `EHLO after TLS rejected: ${reply}`,
          });
        step = "auth-start";
        return socket.write("AUTH LOGIN\r\n");

      case "auth-start":
        if (code !== "334") {
          return finish({
            ok: false,
            message: `The server refused AUTH LOGIN (${reply}). It may only offer PLAIN.`,
          });
        }
        step = "auth-user";
        return socket.write(b64(login));

      case "auth-user":
        if (code !== "334")
          return finish({ ok: false, message: `Username rejected: ${reply}` });
        step = "auth-pass";
        return socket.write(b64(key));

      case "auth-pass":
        if (code === "235") return finish({ ok: true, message: reply });
        if (code === "535")
          return finish({
            ok: false,
            message:
              "Authentication rejected. Gmail needs a 16-character App Password (myaccount.google.com/apppasswords), not your Google password.",
          });
        if (code === "454")
          return finish({
            ok: false,
            message: "Temporary auth failure. The server may be rate limiting.",
          });
        return finish({
          ok: false,
          message: `Unexpected reply to AUTH: ${reply}`,
        });

      default:
        return finish({ ok: false, message: "Internal error: unknown step." });
    }
  };

  // SMTP replies can span several lines: "250-A" ... "250 B". Buffer until a
  // line arrives whose code is NOT followed by a hyphen, then act on the whole
  // reply - capabilities such as STARTTLS are advertised in the earlier lines.
  function onData(chunk) {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return;
    const last = lines[lines.length - 1];
    if (/^\d{3}-/.test(last)) return; // still reading the reply
    buffer = "";
    onReply(lines.join("\n"));
  }

  socket.setTimeout(20000);
  socket.on("data", onData);
  socket.on("timeout", () =>
    finish({ ok: false, message: "Timed out waiting for the server." }),
  );
  socket.on("error", (e) =>
    finish({ ok: false, message: `Connection error: ${e.message}` }),
  );
  socket.on("close", () =>
    finish({
      ok: false,
      message: "The server closed the connection unexpectedly.",
    }),
  );
});

if (handshake.ok) {
  ok(`Authenticated as ${login}`);
  info(handshake.message);
  console.log("\nRESULT: these credentials work.\n");
  console.log("Now paste them into Supabase:\n");
  console.log(
    "  Authentication > Emails > SMTP Settings > Enable Custom SMTP\n",
  );
  console.log(`    Host              ${host}`);
  console.log(`    Port              ${port}`);
  console.log(`    Username          ${login}`);
  console.log(`    Password          (copy it from .env — never echoed here)`);
  if (sender) console.log(`    Sender email      ${sender}`);
  console.log(`    Sender name       ${senderName}`);
  console.log(
    '\nThen open Authentication > Emails > Email Templates > "Magic link",',
  );
  console.log(
    "paste supabase/email-template-otp.html over the current contents, and save.\n",
  );
} else {
  bad(handshake.message);
  console.log("\nRESULT: the credentials did not work.\n");
  console.log("Checklist:");
  console.log(
    "  - 2-Step Verification is on and the App Password has not been revoked",
  );
  console.log("  - the login is the full Gmail address, not a linked account");
  console.log(
    "  - the password is the 16-character App Password, not your Google password",
  );
  console.log(
    "  - Sender Email equals the login (Gmail sends only as the account itself)",
  );
  console.log(`  - port ${port} is reachable from this machine\n`);
}
