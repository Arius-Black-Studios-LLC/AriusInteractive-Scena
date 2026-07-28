-- Quick admin bootstrap — run this if you get:
--   ERROR: column "is_admin" of relation "profiles" does not exist
--
-- Then run the full platform admin setup:
--   docs/supabase-admin-featured.sql
--   docs/supabase-admin-moderation.sql

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Make YOUR account admin (edit email, run once):
-- update public.profiles
-- set is_admin = true
-- where lower(email) = lower('you@example.com');

-- Verify:
-- select id, email, is_admin from public.profiles where is_admin = true;
