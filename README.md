# Mana Raktha Datha (మన రక్తదాత)

A free community website that helps families in Telangana and Andhra Pradesh find willing blood donors. Donors register with their blood group and state; people who need blood log in, search and call a donor directly. It is **not** a blood bank and stores no blood.

## Project structure

```
mana-raktha-datha/
├── index.html              Page shell: header, footer, meta tags, loads CSS and JS
├── 404.html                Shown for a bad URL
├── css/
│   └── styles.css          All styling (white and blood-red theme, animations, mobile tab bar)
├── js/
│   ├── config.js           EDIT THIS: images, organisation details, social links, media
│   ├── states.js           All 28 states and 8 union territories, with Telugu names
│   ├── env.js              GENERATED - your Supabase keys. Git-ignored, never edit
│   └── app.js              Views, search, OTP login, admin panel, emergency board, Telugu toggle
├── images/                 Illustrations (WebP) and app icons
│   └── icons/              Favicon and home-screen icons
├── supabase/
│   ├── schema.sql          Tables, indexes, security rules, search and phone-reveal functions
│   └── README.md           How the database is put together
├── docs/
│   ├── SETUP.md            Step-by-step: Supabase, email, hosting, first admin, keep-alive
│   ├── EMAIL-OTP.md        SMTP setup (Gmail) for 6-digit codes
│   └── LAUNCH-CHECKLIST.md Things to finish before going public
├── server/                 Local API: /api/health uptime probe, static serving
│   ├── index.js             Entry point - `npm run dev:api`
│   ├── app.js               Express shell: /api, static files, shared guards
│   ├── routes/health.js     GET /api/health (uptime probe)
│   └── app.test.mjs         Smoke tests, part of `npm test`
├── scripts/
│   ├── dev.mjs             Local web server; also spawns the API and proxies /api
│   ├── build-env.mjs       Turns .env into js/env.js
│   ├── db-push.mjs         Applies schema.sql to Supabase from the terminal
│   ├── check-supabase.mjs  Tests the live connection and the schema
│   ├── check-smtp.mjs      Tests the Gmail SMTP login without sending mail
│   ├── verify-project.mjs  Checks the project structure and for leaked secrets
│   └── lib/                Shared helpers (env, SQL parser) with unit tests
├── .github/workflows/
│   └── keep-alive.yml      Stops Supabase pausing the free project
├── .env.example            Copy to .env and fill in your keys
├── site.webmanifest        "Add to home screen" settings
├── _headers                Security headers and caching for Cloudflare Pages
├── robots.txt
├── package.json            npm scripts; site is dependency-free, the API adds express/nodemailer
├── .editorconfig
└── .gitignore
```

## Quick start

```bash
npm run setup    # copy .env.example to .env, then add your Supabase keys
npm run setup    # again, to generate js/env.js from your keys
npm run check    # confirm Supabase is reachable and the schema is applied
npm run dev      # serve at http://localhost:5173
```

Full walkthrough: [`docs/SETUP.md`](docs/SETUP.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local server with live reload of `.env`; blocks access to secrets |
| `npm run setup` | Validates your keys and writes `js/env.js` |
| `npm run check` | Tests the live Supabase project, tables, functions and email |
| `npm run verify` | Checks the project structure and that no key is committed |
| `npm run db:push` | Applies `supabase/schema.sql` to Supabase from the terminal |
| `npm run db:push -- --dry` | Lists the statements without touching the database |
| `npm run email:check` | Tests the Gmail SMTP login without sending an email |
| `npm test` | Unit tests for the credential helpers |
| `npm run check:all` | verify + test + check in one go |
| `npm run build` | What Cloudflare Pages runs: regenerates `js/env.js` |

## Features

- Email OTP sign-up and login (free), 6-digit code, expiry and attempt limits
- Searchable location picker covering all 28 states and 8 union territories, in English and Telugu
- Donor search by blood group and state, with compatible groups and 90/120-day eligibility rule
- Phone numbers revealed only to logged-in users, limited to 10 per day
- Admin approval of new donors, user reports, block and dismiss
- Emergency request board with WhatsApp share
- Info page: compatibility chart and FAQ
- Telugu and English toggle (partial translation)
- About, Privacy Policy, Terms, Medical disclaimer, Contact pages and a footer with social icons
- Mobile-first design, bottom tab bar, animations that respect reduced-motion settings

## Tech

Plain HTML, CSS and JavaScript with **no build step**. The live site runs
on Supabase - the database, login and API are called directly from the browser,
so there is no server of our own to run or pay for. A small optional Node
server under `server/` provides `/api/health` for uptime monitoring and serves
the site locally; it adds `express` and `nodemailer` as runtime dependencies,
and only to that server - the site itself stays dependency-free.

| Layer | Service | Notes |
|---|---|---|
| Website | Cloudflare Pages | Unlimited bandwidth, free HTTPS and custom domains |
| Database, login, API | Supabase Free | 500 MB database, 50,000 monthly users, unlimited API requests |
| Email codes | Gmail, free | About 500 emails per day |
| Keep-alive | GitHub Actions | Free scheduled query every 3 days |
| CAPTCHA (later) | Cloudflare Turnstile | Free |

Security is enforced in the database, not in the browser: row level security
plus `search_donors()` and `reveal_phone()` functions mean a visitor cannot
read donor phone numbers by any other route. `_headers` adds security headers
and caching on Cloudflare Pages.

## Known limitations

- "Delete my data" removes the profile but not the login record; full removal needs an admin action.
- Telugu covers menus and main headings only. Have a native speaker review it.
- No donation reminder emails, post-call feedback or camps calendar yet.
- No daily cap on emergency posts yet.
- Free tiers have limits (Gmail allows about 500 emails a day; a Supabase project that pauses if idle, mitigated by the keep-alive workflow).
- GitHub stops scheduled workflows in public repositories after 60 days without a commit.
- The illustrations are AI-generated. Present them as illustrations, not as real donors.
- The legal pages are plain-language templates, not legal advice. Have them reviewed before launch.

