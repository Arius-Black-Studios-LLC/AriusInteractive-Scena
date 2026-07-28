-- Grant platform admin (Staff picks + Moderation)
-- Run in Supabase Dashboard → SQL Editor (runs as postgres — bypasses client protection).
--
-- Prerequisites (run once if missing):
--   docs/supabase-admin-bootstrap.sql   OR   docs/supabase-admin-featured.sql
--   docs/supabase-admin-moderation.sql
--
-- 1) Find your account email / id:
select id, email, is_admin, created_at
from public.profiles
order by created_at desc
limit 25;

-- 2) Grant admin — replace the email below, then run ONLY this line:
-- update public.profiles
-- set is_admin = true
-- where lower(email) = lower('you@example.com');

-- Or grant by user id from step 1:
-- update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000000';

-- 3) Verify:
select id, email, is_admin from public.profiles where is_admin = true;

-- 4) Verify admin RPCs exist (should return 2+ rows):
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'is_platform_admin',
    'admin_list_published_series',
    'admin_set_series_featured'
  )
order by routine_name;

-- After granting: log out on the site, log back in, then open /admin/featured
