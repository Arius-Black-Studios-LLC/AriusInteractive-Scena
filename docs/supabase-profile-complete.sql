-- Profile columns required by Account settings (run once in Supabase SQL Editor)
-- Fixes: "Could not find the 'adult_verified_at' column of 'profiles' in the schema cache"
--
-- Safe to re-run (uses IF NOT EXISTS).

alter table public.profiles
  add column if not exists username text,
  add column if not exists pronouns text,
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists birth_year int check (birth_year >= 1900 and birth_year <= extract(year from now())::int);

alter table public.profiles
  add column if not exists adult_verified_at timestamptz;

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null and username <> '';

-- Verify:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles'
-- order by column_name;
