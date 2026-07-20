-- Scena: easy cloud save (Supabase Dashboard → SQL → New query)
-- Requires supabase-setup.sql (profiles) to be applied first.
--
-- Run ONCE when setting up cloud save. If Scena already says "Saved to cloud",
-- you are done — do not re-run this unless you are fixing a broken setup.
--
-- Safe to re-run (this file): existing policies are dropped before recreate.
-- If you see "policy already exists", you ran an OLD copy without DROP lines —
-- ignore it; your setup is already in place.
-- ── 1. Storage bucket (fixes "Bucket not found") ─────────────────────────────
-- You can also create this in Dashboard → Storage → New bucket:
--   Name: series-assets   Public: ON
insert into storage.buckets (id, name, public)
values ('series-assets', 'series-assets', true)
on conflict (id) do update
  set public = true,
      name = excluded.name;

-- ── 2. Project data table ──────────────────────────────────────────────────────
create table if not exists public.studio_series (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists studio_series_user_updated_idx
  on public.studio_series (user_id, updated_at desc);

alter table public.studio_series enable row level security;

drop policy if exists "Users read own series" on public.studio_series;
create policy "Users read own series"
  on public.studio_series for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own series" on public.studio_series;
create policy "Users insert own series"
  on public.studio_series for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own series" on public.studio_series;
create policy "Users update own series"
  on public.studio_series for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own series" on public.studio_series;
create policy "Users delete own series"
  on public.studio_series for delete
  using (auth.uid() = user_id);

-- Anyone (including signed-out readers) can load published series for Discover / Play.
drop policy if exists "Public read published series" on public.studio_series;
create policy "Public read published series"
  on public.studio_series for select
  using (
    (data->>'status') = 'published'
    or exists (
      select 1
      from jsonb_array_elements(coalesce(data->'episodes', '[]'::jsonb)) as ep
      where coalesce(ep->>'isLive', 'false') = 'true'
    )
  );

-- ── 3. Storage policies (lets logged-in users upload their own images) ───────
drop policy if exists "Public read series assets" on storage.objects;
create policy "Public read series assets"
  on storage.objects for select
  using (bucket_id = 'series-assets');

drop policy if exists "Users upload own series assets" on storage.objects;
create policy "Users upload own series assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'series-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own series assets" on storage.objects;
create policy "Users update own series assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'series-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own series assets" on storage.objects;
create policy "Users delete own series assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'series-assets'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Verify setup (run this anytime instead of re-running the whole file):
-- select id, name, public from storage.buckets where id = 'series-assets';
-- select count(*) as series_rows from public.studio_series;
--
-- Badges (optional, run supabase-badges-setup.sql):
-- select badges, creator_stats from public.profiles limit 5;