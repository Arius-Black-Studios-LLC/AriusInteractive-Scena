-- Scena: creator badges & stats on profiles
-- Run once in Supabase Dashboard → SQL (after supabase-setup.sql)

alter table public.profiles
  add column if not exists badges jsonb not null default '[]'::jsonb;

alter table public.profiles
  add column if not exists creator_stats jsonb not null default '{}'::jsonb;

-- creator_stats shape (app-managed):
-- {
--   "lessonsCompleted": ["connect-two-nodes", ...],
--   "seriesCount": 0,
--   "publishedEpisodes": 0,
--   "totalReaders": 0,
--   "unlockedAt": { "first_series": "2026-01-01T..." }
-- }
