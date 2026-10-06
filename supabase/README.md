# Database

Everything the site needs lives in `schema.sql`. Paste the whole file into the
Supabase **SQL Editor** and run it. It is idempotent, so running it again
after a change will not wipe your donors.

## Tables

| Table | Holds | Visible to |
|---|---|---|
| `profiles` | One donor record per signed-up user: blood group, state, area, phone, availability, approval status | Owner and admins only |
| `reports` | Abuse reports filed against a donor | Admins only |
| `reveals` | A log of every phone number revealed, used for the 10-per-day cap | Nobody, by design |
| `requests` | Emergency "I need blood" posts | Any signed-in user |

## How the privacy rules are enforced

The important idea: **the browser is never trusted.**

- Row level security is switched on for every table. A signed-in user can
  select only their own `profiles` row, so no amount of JavaScript in the
  console can list everyone's phone numbers.
- `reveals` has **no policies at all**. The only way to write to it is the
  `reveal_phone()` function, which counts the last 24 hours and refuses the
  eleventh request. A user cannot reset that counter from the client.
- `search_donors()` returns names, blood groups and areas only — never a
  phone number. It also filters out the caller's own row, unapproved
  profiles, and anyone inside the 90-day (men) or 120-day (women) window.
- Both functions are `security definer` and their `execute` privilege is
  revoked from `public` and `anon`, then granted only to `authenticated`.
  Calling them while logged out returns an error.
- `lock_admin_fields()` resets `status` and `is_admin` to their old values
  unless the caller is already an admin, so nobody can approve themselves.
  `guard_profile_insert()` does the same on insert.

## Changing the rules

**Reveal limit** is `10` in `reveal_phone()`, inside the `interval '1 day'`
check. Change both numbers together.

**Donation waiting period** is in `wait_days()`: 90 days, or 120 for a donor
whose `gender` is `'F'`. The browser mirrors these values in `CAN_GIVE` and
`js/app.js`, so change them in both places.

**Blood group compatibility** is in `can_give()`. `js/app.js` has a
`CAN_GIVE` object with the same table for the labels shown on screen.

