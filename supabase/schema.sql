-- =============================================================================
-- Mana Raktha Datha - Supabase schema
-- =============================================================================
-- HOW TO RUN
--   Supabase dashboard > SQL Editor > New query > paste this file > Run.
--   Every statement is idempotent, so you can paste it again after an update
--   without breaking an existing database.
--
-- Requires: Authentication > Providers > Email must be enabled.
-- After running, use `npm run check` to verify everything is in place.
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- One row per signed-up user, created by the trigger in section 4 so a profile
-- can never exist without a matching auth user.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique,
  name          text not null,
  phone         text not null check (phone ~ '^[6-9][0-9]{9}$'),
  age           int  check (age between 18 and 65),
  blood_group   text not null check (blood_group in ('A+','A-','B+','B-','O+','O-','AB+','AB-')),
  gender        text check (gender in ('M','F')),
  state         text not null,
  area          text,
  last_donation date,
  available     boolean not null default true,
  status        text not null default 'pending' check (status in ('pending','approved','blocked')),
  is_admin      boolean not null default false,
  consent_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Add `email` to databases created before this column existed, then backfill
-- it from auth.users so the admin panel can show which account to approve.
alter table public.profiles add column if not exists email text;
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- Ensure email is UNIQUE. The CREATE TABLE above already declares it, so this
-- only does something on a database created before that column existed.
--
-- Note: UNIQUE requires ADD, not SET. ALTER COLUMN ... SET accepts NOT NULL,
-- DEFAULT and similar, but not UNIQUE, which is a table-level constraint.
--
-- Postgres treats NULLs as distinct in a unique index, so rows with no email
-- do not block the constraint and do not need to be checked for.
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
     where i.indrelid = 'public.profiles'::regclass
       and i.indisunique
       and i.indnatts = 1
       and (select attname from pg_attribute
             where attrelid = i.indrelid and attnum = i.indkey[0]) = 'email'
  ) then
    execute 'alter table public.profiles add constraint profiles_email_key unique (email)';
  end if;
end $$;

-- Safety reports filed by one user against another donor.
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  donor_id    uuid not null references public.profiles(id) on delete cascade,
  reporter_id uuid not null references auth.users(id)   on delete cascade,
  reason      text not null check (char_length(reason) between 1 and 200),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Audit trail for phone reveals, used for the 10-per-day limit.
-- Intentionally has NO select policy: only reveal_phone() may touch it.
create table if not exists public.reveals (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id)     on delete cascade,
  donor_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Urgent "I need blood" posts.
create table if not exists public.requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  blood_group text not null check (blood_group in ('A+','A-','B+','B-','O+','O-','AB+','AB-')),
  state        text not null,
  hospital    text not null check (char_length(hospital) between 1 and 80),
  units       int not null default 1 check (units between 1 and 10),
  poster_name text not null,
  phone       text not null check (phone ~ '^[6-9][0-9]{9}$'),
  fulfilled   boolean not null default false,
  created_at  timestamptz not null default now()
);


-- =============================================================================
-- 2. INDEXES   (search filters run on every page load)
-- =============================================================================
create index if not exists profiles_search_idx on public.profiles (state, blood_group)
  where status = 'approved' and available;
create index if not exists profiles_status_idx  on public.profiles (status);
create index if not exists reports_open_idx     on public.reports (resolved, created_at desc);
create index if not exists reports_donor_idx    on public.reports (donor_id);
create index if not exists reveals_user_day_idx on public.reveals (user_id, created_at desc);
create index if not exists requests_open_idx    on public.requests (created_at desc)
  where fulfilled = false;

-- =============================================================================
-- 3. HELPER FUNCTIONS
-- =============================================================================

-- True when the current caller is an admin. security definer so it can read
-- profiles inside RLS policies without recursing.
create or replace function public.is_admin() returns boolean
  language sql security definer set search_path = public stable as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Which donor groups can give red cells to recipient group g.
create or replace function public.can_give(g text) returns text[]
  language sql immutable as $$
  select case g
    when 'O-'  then array['O-']
    when 'O+'  then array['O+','O-']
    when 'A-'  then array['A-','O-']
    when 'A+'  then array['A+','A-','O+','O-']
    when 'B-'  then array['B-','O-']
    when 'B+'  then array['B+','B-','O+','O-']
    when 'AB-' then array['AB-','A-','B-','O-']
    else array['A+','A-','B+','B-','O+','O-','AB+','AB-']
  end
$$;

-- Days a donor must wait between donations, by the donor's recorded gender.
create or replace function public.wait_days(g text) returns int
  language sql immutable as $$
  select case when g = 'F' then 120 else 90 end
$$;


-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

-- Create the profile when a new user signs up.
-- The sign-up call passes these fields in options.data. A user created without
-- them (a login attempt on an unknown email) gets no profile.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  m jsonb := new.raw_user_meta_data;
begin
  if m->>'name' is null then return new; end if;
  insert into public.profiles
    (id, email, name, phone, age, blood_group, gender, state, area, last_donation)
  values
    (new.id, new.email, m->>'name', m->>'phone', nullif(m->>'age','')::int,
     m->>'blood_group', m->>'gender', m->>'state', m->>'area',
     nullif(m->>'last_donation','')::date)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in step if the login email is ever changed.
create or replace function public.handle_email_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_email_change();

-- Users cannot approve themselves or make themselves admin: if the caller is
-- not an admin, force the approval fields back to their previous values.
--
-- Two ways around this, both deliberate:
--   1. A session flag, set by make_first_admin() below. This is what lets the
--      very first admin be promoted, because at that moment is_admin() is
--      still false and would otherwise revert the change.
--   2. Running as the table owner or a superuser, i.e. you pasting SQL into
--      the Supabase SQL Editor. A browser request can never claim either
--      role, so this does not open a hole in the security rules.
create or replace function public.lock_admin_fields() returns trigger
  language plpgsql as $$
begin
  if coalesce(current_setting('mrd.admin_bypass', true), 'off') = 'on' then
    return new;
  end if;
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if not public.is_admin() then
    new.status   := old.status;
    new.is_admin := old.is_admin;
  end if;
  return new;
end $$;

drop trigger if exists profiles_lock on public.profiles;
create trigger profiles_lock before update on public.profiles
  for each row execute function public.lock_admin_fields();

-- A profile row is created only by the sign-up trigger, never by the browser.
-- Without this, a crafted request could insert a pending+admin row directly.
create or replace function public.guard_profile_insert() returns trigger
  language plpgsql as $$
begin
  if not public.is_admin() then
    new.status   := 'pending';
    new.is_admin := false;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_insert on public.profiles;
create trigger profiles_guard_insert before insert on public.profiles
  for each row execute function public.guard_profile_insert();

-- =============================================================================
-- 5. SEARCH AND PHONE REVEAL
-- =============================================================================
-- Both are security definer so phone numbers never leave through a plain
-- query: profiles has no select policy covering other users, and these two
-- functions are executable only by signed-in users.

-- Donor search. Requires a session; hides your own row and unapproved rows.
create or replace function public.search_donors(
  p_group text default null,
  p_state text default null,
  p_compat boolean default true)
returns table(id uuid, name text, blood_group text, state text, area text, days_since int)
  language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.blood_group, p.state, p.area,
         (current_date - p.last_donation)
    from public.profiles p
   where auth.uid() is not null
     and p.status = 'approved'
     and p.available
     and p.id <> auth.uid()
     and (p.last_donation is null
          or current_date - p.last_donation >= public.wait_days(p.gender))
     and (coalesce(p_state,'') = '' or p.state = p_state)
     and (coalesce(p_group,'') = '' or p.blood_group = any(
           case when p_compat then public.can_give(p_group) else array[p_group] end))
   order by (p.blood_group = p_group) desc, p.last_donation nulls first
   limit 50
$$;

-- Reveal one donor's number. Capped at 10 per user per rolling 24 hours.
create or replace function public.reveal_phone(p_donor uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare
  ph text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'complete registration first';
  end if;
  if p_donor is null or p_donor = auth.uid() then
    raise exception 'cannot reveal your own number';
  end if;
  if (select count(*) from public.reveals
       where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'daily limit of 10 numbers reached';
  end if;
  select p.phone into ph
    from public.profiles p
   where p.id = p_donor and p.status = 'approved';
  if ph is null then raise exception 'donor not found'; end if;
  insert into public.reveals(user_id, donor_id) values (auth.uid(), p_donor);
  return ph;
end $$;

-- Default-deny: take execute away from everyone, then allow signed-in users.
revoke all on function public.search_donors(text, text, boolean) from public, anon, authenticated;
grant  execute on function public.search_donors(text, text, boolean) to authenticated;
revoke all on function public.reveal_phone(uuid) from public, anon, authenticated;
grant  execute on function public.reveal_phone(uuid) to authenticated;

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.reports  enable row level security;
alter table public.reveals  enable row level security;
alter table public.requests enable row level security;

-- profiles: you read and edit only your own row; admins may do everything.
drop policy if exists own_profile_read   on public.profiles;
drop policy if exists own_profile_update on public.profiles;
drop policy if exists own_profile_delete on public.profiles;
drop policy if exists admin_profiles     on public.profiles;

create policy own_profile_read   on public.profiles for select
  using (id = auth.uid());
create policy own_profile_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy own_profile_delete on public.profiles for delete
  using (id = auth.uid());
create policy admin_profiles     on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- reports: anyone signed in may file one; only admins may read or change them.
drop policy if exists report_insert on public.reports;
drop policy if exists admin_reports on public.reports;
create policy report_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy admin_reports on public.reports for all
  using (public.is_admin()) with check (public.is_admin());

-- reveals: deliberately no policies. Only reveal_phone() can read or write it,
-- which is what keeps the 10-per-day limit un-bypassable from the browser.

-- requests: readable when signed in; the author and admins can change them.
drop policy if exists req_read   on public.requests;
drop policy if exists req_insert on public.requests;
drop policy if exists req_update on public.requests;
drop policy if exists req_delete on public.requests;
create policy req_read   on public.requests for select to authenticated using (true);
create policy req_insert on public.requests for insert to authenticated
  with check (user_id = auth.uid());
create policy req_update on public.requests for update to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy req_delete on public.requests for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());


-- =============================================================================
-- 7. MAKE YOURSELF THE FIRST ADMIN
-- =============================================================================
-- Register on the site once, then run with your own email:
--     select public.make_first_admin('you@example.com');
-- It refuses to run once any admin exists, so nobody else can promote
-- themselves if database access is ever shared.
create or replace function public.make_first_admin(p_email text) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  done   int;
begin
  if exists (select 1 from public.profiles where is_admin) then
    raise exception 'an admin already exists - update the profile row directly instead';
  end if;
  select id into target from auth.users where email = lower(trim(p_email));
  if target is null then raise exception 'no user with that email - register on the site first'; end if;
  -- Without this the profiles_lock trigger would see is_admin() = false and
  -- quietly undo the promotion. The third argument limits it to this
  -- transaction, so it cannot leak into the next one.
  perform set_config('mrd.admin_bypass', 'on', true);
  update public.profiles set is_admin = true, status = 'approved' where id = target;
  get diagnostics done = row_count;
  perform set_config('mrd.admin_bypass', 'off', true);
  return done > 0;
end $$;

revoke all on function public.make_first_admin(text) from public, anon, authenticated;
grant execute on function public.make_first_admin(text) to service_role;


-- =============================================================================
-- Done. Now run: npm run check
-- =============================================================================
