/* Mana Raktha Datha - site configuration.
 *
 * Supabase keys are NOT stored in this file. They live in `.env` and are
 * compiled into `js/env.js` by `npm run setup`. Both files are git-ignored,
 * so no key is ever committed to the repository.
 *
 * To change anything below, edit this file and reload the page.
 */

/* 1. Supabase connection ---------------------------------------------------- */
/* Reads js/env.js if it was generated; otherwise falls back to the placeholders
   so the site shows a clear "Setup needed" message instead of crashing. */
const ENV = (typeof window !== "undefined" && window.MRD_ENV) || {};
const SUPABASE_URL = (ENV.SUPABASE_URL || "PASTE_PROJECT_URL").replace(
  /\/+$/,
  "",
);
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY || "PASTE_ANON_PUBLIC_KEY";

/* Accepts both the legacy https://<ref>.supabase.co and newer
   https://<ref>.supabase.co/rest/v1 style project URLs, plus .supabase.in. */
const READY =
  /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL) &&
  SUPABASE_ANON_KEY.length > 20 &&
  /^(sb_publishable_|eyJ)/.test(SUPABASE_ANON_KEY) &&
  typeof supabase !== "undefined";

const sb = READY
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/* 2. Images used across the site (files live in the images folder). */
const IMG = {
  logo: "images/logo.webp",
  hero: "images/hero.webp",
  trio: "images/trio.webp",
  camp: "images/camp.webp",
  emerg: "images/emergency.webp",
  step1: "images/step1.webp",
  step2: "images/step2.webp",
  step3: "images/step3.webp",
  comm: "images/community.webp",
  aware: "images/awareness.webp",
};
document.getElementById("logo").src = IMG.logo;
document.documentElement.style.setProperty("--hero", 'url("' + IMG.hero + '")');

/* 3. Your organisation details, shown on the About, Privacy, Terms and Contact pages. */
const ORG = {
  name: "Mana Raktha Datha",
  owner: "[Owner name or organisation]",
  email: "[contact email]",
  phone: "[contact phone]",
  place: "[City, State]",
  updated: "October 2026",
};
/* ADMIN_EMAIL in .env is your Supabase login. Reusing it as the public contact
   address saves you editing this file by hand, but change it before launch. */
if (ENV.ADMIN_EMAIL) ORG.email = ENV.ADMIN_EMAIL;

/* 4. Social media links for the footer and Contact page. */
// Paste your links here. Leave '' to show "coming soon". Examples: https://instagram.com/yourhandle , https://whatsapp.com/channel/XXXX , https://chat.whatsapp.com/XXXX
const SOCIAL = {
  instagram: "",
  facebook: "",
  linkedin: "",
  channel: "",
  group: "",
};

/* 5. Optional photo and video on the home page. */
// Optional media. photo: path or URL of an image. video: YouTube embed link like https://www.youtube.com/embed/VIDEO_ID
const MEDIA = { photo: "", video: "" };
