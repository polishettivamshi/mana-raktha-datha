# Launch checklist

## Must be done

- [ ] `supabase/schema.sql` pasted and run; `npm run check` passes every line
- [ ] `.env` filled in and `npm run setup` completed (never the `service_role` key)
- [ ] `js/config.js`: `ORG` details and `SOCIAL` links filled in
- [ ] Registered on the live site and the 6-digit code arrives
- [ ] `select public.make_first_admin('you@email');` run, Admin tab visible
- [ ] Gmail App Password created, custom SMTP set, Magic Link template shows `{{ .Token }}`
- [ ] GitHub Action "Keep Supabase alive" added the two secrets and run once
- [ ] Cloudflare Pages deployed with `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- [ ] `og:image` URL in `index.html` changed from `YOUR-DOMAIN` to the real address
- [ ] Domain chosen and bought (check spelling variants: Datha, Daata, Dhatha)
- [ ] Instagram handle and trademark search checked
- [ ] Privacy Policy: Cloudflare named as host; Contact page: grievance officer and response times filled in
- [ ] Privacy Policy and Terms reviewed by a lawyer (this is health-related data)
- [ ] Telugu text reviewed by a native speaker
- [ ] Approval flow tested end to end: register, approve, search, reveal, report
- [ ] Reveal cap tested: the 11th reveal is refused
- [ ] "Delete my data" tested
- [ ] Tested on a real Android phone, an iPhone and a laptop
- [ ] Share link previews correctly in WhatsApp
- [ ] `npm run verify` passes and no key appears in the git history

## Should be done

- [ ] Decide how often to export the database (free Supabase projects have no downloadable backups)
- [ ] Plan for the free tier's 300–500 emails per day; add a second provider if you grow
- [ ] Add Cloudflare Turnstile before heavy promotion
- [ ] Add a daily cap on emergency posts (not implemented yet)
- [ ] Write down who else holds an admin account
- [ ] Tell donors and NGOs how to report misuse

## After launch

- [ ] Check the keep-alive Action ran on schedule
- [ ] Make a commit at least every 60 days, or GitHub pauses the schedule
- [ ] Watch for the Supabase "project is paused" email

