# Setup guide

Follow this in order. It takes about 30 minutes the first time.

## 0. What you need

| Thing | Where | Cost |
|---|---|---|
| Supabase project | supabase.com | Free (pauses after 7 days idle) |
| Cloudflare account | dash.cloudflare.com | Free |
| Google account (Gmail) | myaccount.google.com | Free (~500 emails/day) |
| Node.js 18 or newer | nodejs.org | Free |

```bash
git clone https://github.com/polishettivamshi/mana-raktha-datha.git
cd mana-raktha-datha
npm run setup      # creates .env from .env.example
```

## 1. Create the database (Supabase)

1. Create a free project at supabase.com.
2. Create a personal access token:
   **Account > Access Tokens > Generate new token**, name it
   `mana-raktha-datha`, and copy the `sbp_...` value.
3. Put it in `.env` next to your other keys:

   ```
   SUPABASE_ACCESS_TOKEN=sbp_...
   ```

   That token bypasses all row level security. `.env` is git-ignored, so it
   never reaches the repository. Delete the token from the Supabase dashboard
   if it is ever exposed.

4. Apply the schema from the terminal:

   ```bash
   npm run db:push -- --dry     # shows what would run, changes nothing
   npm run db:push              # applies it
   ```

   `npm run db:push` splits `supabase/schema.sql` into 68 statements, runs the
   static checks, then applies each one so a failure names the exact statement.
   It finishes by confirming the tables, functions and policies exist.

   Re-running it is safe: every statement is idempotent.

If you prefer the browser, pasting the same file into **SQL Editor** works
exactly as well. The terminal route just gives better error messages.

## 2. Put your keys in `.env`

1. In Supabase open **Project Settings > Data API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `.env` and paste them in:

   ```
   SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOi...
   ADMIN_EMAIL=you@gmail.com
   ```

> **Never use the `service_role` key.** It bypasses every security rule and
> would let anyone who loads the site read the whole database. `npm run setup`
> decodes the key and refuses to continue if you paste it by mistake.

4. Run `npm run setup`. It writes `js/env.js`, which the site loads.
5. Run `npm run check` to test the connection. Everything should pass.

## 3. Test it locally

```bash
npm run dev      # http://localhost:5173
```

Open the site, register with a real email address, and confirm the 6-digit
code arrives. Without SMTP you may get a clickable link instead (see below).

## 4. Email codes that people can actually use

**This is the step that makes the site work for the public.** Without it,
Supabase sends 2 emails an hour to team members only.

Full walkthrough with screenshots-level detail: [`docs/EMAIL-OTP.md`](docs/EMAIL-OTP.md).

1. Create a **Gmail App Password** — a 16-character code from
   `myaccount.google.com/apppasswords` (2-Step Verification must be on first).
   Step-by-step: `docs/EMAIL-OTP.md`.
2. Copy the SMTP host, port, login and password from `.env`.
3. In Supabase go to **Authentication > Emails > SMTP Settings**, turn on
   **Custom SMTP** and paste those details.
4. In **Email Templates**, edit the **Magic Link** template so it shows
   `{{ .Token }}` (the 6-digit code) instead of only a link.
5. Set the OTP expiry to 600 seconds and turn **Confirm email** off.
6. `npm run check` will confirm the mailer is configured.

The address in `.env` (`ADMIN_EMAIL` / `SMTP_LOGIN`) is used as the public
contact address on the site and as the sender too — always with an App
Password, never the normal Google password. See `docs/EMAIL-OTP.md`.

## 5. Make yourself admin

1. Register on the live site with your own email, then log out.
2. In the Supabase SQL Editor run, with your real address:

   ```sql
   select public.make_first_admin('you@gmail.com');
   ```

   It returns `true` on success and refuses to run a second time, so nobody
   else can promote themselves later. To promote someone else afterwards:

   ```sql
   update public.profiles set is_admin = true, status = 'approved'
    where id = (select id from auth.users where email = 'someone@gmail.com');
   ```

3. Log in again. An **Admin** tab appears.

## 6. Host it on Cloudflare Pages

1. Push the project to GitHub.
2. In the Cloudflare dashboard choose **Workers & Pages > Create > Pages** and
   connect the repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `/`
   - Node version: `20` (environment variable `NODE_VERSION`)
4. **Settings > Environment variables** (set for Production):
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_ANON_KEY` = your anon public key
5. Save and deploy. The build step turns those variables into `js/env.js`.
6. Add your domain under **Custom domains**.

`_headers` supplies security headers and caching on Cloudflare Pages.
Avoid Vercel's Hobby plan: it is non-commercial only.

## 7. Keep the database awake

Supabase pauses free projects after 7 days without activity. For a site that
must work during an emergency, turn on the included GitHub Action:

1. Push the repository to GitHub.
2. **Settings > Secrets and variables > Actions > New repository secret**, add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (anon key only)
3. Open the **Actions** tab, choose **Keep Supabase alive**, click
   **Run workflow** once to confirm it passes.

It then runs every three days and costs nothing on a public repository.
Note that GitHub pauses scheduled workflows in public repositories after 60
days without any commit, so keep making small updates.

## 8. Test before you launch

1. Register a second account and approve it from the Admin tab.
2. Search from a third account and reveal a number.
3. Reveal eleven numbers to confirm the daily cap message appears.
4. Post an emergency request and mark it fulfilled.
5. Confirm the "Delete my data" button removes the profile.
6. Work through `docs/LAUNCH-CHECKLIST.md`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Setup needed" on the page | `js/env.js` is missing. Run `npm run setup`. |
| `relation "profiles" does not exist` | `schema.sql` was not run. Do step 1. |
| Code never arrives | No custom SMTP. Do step 4, see `docs/EMAIL-OTP.md`. Check spam. |
| "daily limit of 10 numbers reached" | Working as designed; clears after 24 hours. |
| "your email address is not confirmed" | Confirm the address, or turn off "Confirm email" under Authentication > Email while testing. |
| Site loads but every query fails | Check the CSP in `_headers` allows `https://*.supabase.co`. |
| `npm run check` reports the project paused | Free project went idle. Run the keep-alive workflow. |
