-- Scena: public profile fields for comments & reader identity
-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — only run AFTER docs/supabase-setup.sql succeeds.
-- If you see: relation "public.profiles" does not exist
--   → run supabase-setup.sql first, not this file.
--
-- Skip this file entirely if you just ran the current supabase-setup.sql
-- (it already includes username, pronouns, avatar_url).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    raise exception 'Run docs/supabase-setup.sql first — public.profiles does not exist yet.';
  end if;
end $$;

alter table public.profiles
  add column if not exists username text,
  add column if not exists pronouns text,
  add column if not exists avatar_url text;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null and username <> '';

-- Comments store a profile snapshot at post time; no public profile read required yet.
