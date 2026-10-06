# Email codes (6-digit OTP) by SMTP — Gmail

Without this step **no code will ever arrive**. Supabase's built-in mailer is
limited to **2 emails per hour, and only to team members' addresses**. A public
site needs its own SMTP provider, and this project uses **Gmail**: about 500
free emails a day, no new account to create, and your existing
`you@gmail.com` works as-is.

## 1. Create the App Password

1. Turn on **2-Step Verification** first (Google Account > Security >
   2-Step Verification). App passwords stay hidden until it is on.
2. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
   name the app (for example `supabase`), press **Create**, and copy the
   16-character password. Google shows it only once.
3. **Never paste your normal Google password.** An App Password is a separate
   16-character credential that Google can revoke on its own from the same
   page. If the account belongs to an organisation, its administrator may have
   switched app passwords off.

Put the six values in `.env` (the Gmail block in `.env.example` is ready to
copy) — paste the App Password **without spaces** — and keep them for step 2.

Three things to know about Gmail as the mailer:

- **No delivery log.** When a code does not arrive, look at Supabase >
  **Authentication > Logs** instead.
- **About 500 messages a day**, and Google throttles when sending looks
  automated (see section 5).
- **`@gmail.com` only.** With your own domain later you would need a
  different mailer — see the last section.

## 2. Paste them into Supabase

Supabase dashboard > **Authentication > Emails > SMTP Settings**:

| Supabase field | Value |
|---|---|
| Enable Custom SMTP | on |
| SMTP Host | `smtp.gmail.com` |
| SMTP Port | `587` |
| SMTP User | `you@gmail.com` (from `.env` SMTP_LOGIN) |
| SMTP Password | the 16-character App Password |
| Sender Email | `you@gmail.com` (must equal SMTP User) |
| Sender Name | `Mana Raktha Datha` |

Gmail only ever sends as the address you authenticate with, so **Sender Email
must equal SMTP User** — a mismatch shows up as failed sends with no other
explanation.

Save. Then set:

- **Maximum frequency**: `1m0s` (one code per minute per address)
- Enable email confirmations: **off** — the 6-digit code already proves the
  address is real, and leaving it on adds a second email for every new user
- OTP expiry: `600` seconds

## 3. Make the email show a 6-digit code

Supabase sends either a link or a code depending on the template.

A ready-made template is included: **`supabase/email-template-otp.html`**. It
uses the site colours (#B3121F red, #FFF1F2 blush), states that the code is
valid for 10 minutes, and is built with tables and inline styles so it renders
correctly in Outlook and Gmail.

1. Go to **Authentication > Emails > Email Templates**.
2. Open **"Magic link"** (in newer projects it is labelled
   *"Magic link or OTP"*).
3. Open `supabase/email-template-otp.html` in a text editor, copy everything,
   and paste it over the current template. Save.
4. Set the OTP expiry to **600 seconds** (10 minutes) in SMTP settings.

The only part Supabase replaces is `{{ .Token }}`, which becomes the 6-digit
code. Without it, people get a clickable link and the form on the site asks for
digits, which never matches.

The site already calls `verifyOtp({ email, token, type: 'email' })`, so no code
change is needed on this side.

## 3a. Test the credentials first

Before pasting anything into Supabase, confirm they work:

```bash
npm run email:check
```

This opens a real connection to `smtp.gmail.com:587`, negotiates TLS and tries
to authenticate with your App Password. It sends no email. If it prints the
settings to copy, they are correct. It deliberately refuses to transmit the
password if the server does not offer STARTTLS.

Once that passes, paste the printed values into **Authentication > Emails >
SMTP Settings** — the same table as in section 2.

The values live in `.env` as `SMTP_*`, which is what `npm run email:check`
reads; `.env.example` holds the ready-made Gmail block. `.env` itself is
git-ignored and must stay that way.

## 4. Test it

1. `npm run dev`, open the site, register with your own address.
2. Confirm the code arrives within a minute.
3. If it does not arrive:
   - Supabase dashboard > **Authentication > Logs** — it shows the real
     reason (`SMTP` errors, rate limits, `Email not confirmed`)
   - the App Password is still active at
     [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
     (revoke and create a new one if unsure) and 2-Step Verification is on
   - Sender Email equals SMTP User
   - check spam — codes that land there are usually the recipient's filters,
     not a fault in the setup

## 5. Staying inside the daily limit

Gmail allows about 500 emails a day. Each new registration uses 2 (code +
any retry). Each login uses 1. About 250 new donors a day, which is plenty
at the start.

- The site asks for a code only when the user presses the button.
- Supabase blocks the same address for 60 seconds between requests.
- `js/app.js` shows a plain-English message when the limit is hit rather than
  the raw Supabase error.

Google throttles accounts that suddenly start sending a lot of automated
mail. If codes slow down or stop, send a few messages from the account by
hand and try again the next day.

## Moving to your own domain later

Gmail cannot set DKIM for a domain you do not own, so sending as
`donors@yourdomain.com` means switching to a different SMTP provider and
changing the same Supabase form again. That is a deliberate trade: Gmail is
the simplest setup now, and the switch later is a 10-minute change.