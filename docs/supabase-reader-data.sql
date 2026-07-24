-- Arleco: shared reader data (comments, hearts, chapter progress)
-- ═══════════════════════════════════════════════════════════════════════════
-- Run AFTER docs/supabase-setup.sql (profiles + auth).
-- Safe to re-run: policies are dropped before recreate.
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

-- ── Episode comments ───────────────────────────────────────────────────────────
create table if not exists public.episode_comments (
  id uuid primary key default gen_random_uuid(),
  series_id text not null,
  episode_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.episode_comments (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  author jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists episode_comments_thread_idx
  on public.episode_comments (series_id, episode_id, created_at asc);

alter table public.episode_comments enable row level security;

drop policy if exists "Anyone reads episode comments" on public.episode_comments;
create policy "Anyone reads episode comments"
  on public.episode_comments for select
  using (true);

drop policy if exists "Users post episode comments" on public.episode_comments;
create policy "Users post episode comments"
  on public.episode_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own comments" on public.episode_comments;
create policy "Users delete own comments"
  on public.episode_comments for delete
  using (auth.uid() = user_id);

-- ── Comment reactions ──────────────────────────────────────────────────────────
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.episode_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

alter table public.comment_reactions enable row level security;

drop policy if exists "Anyone reads comment reactions" on public.comment_reactions;
create policy "Anyone reads comment reactions"
  on public.comment_reactions for select
  using (true);

drop policy if exists "Users add comment reactions" on public.comment_reactions;
create policy "Users add comment reactions"
  on public.comment_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users remove own reactions" on public.comment_reactions;
create policy "Users remove own reactions"
  on public.comment_reactions for delete
  using (auth.uid() = user_id);

-- ── Episode hearts ─────────────────────────────────────────────────────────────
create table if not exists public.episode_hearts (
  series_id text not null,
  episode_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (series_id, episode_id, user_id)
);

create index if not exists episode_hearts_episode_idx
  on public.episode_hearts (series_id, episode_id);

alter table public.episode_hearts enable row level security;

drop policy if exists "Anyone reads episode hearts" on public.episode_hearts;
create policy "Anyone reads episode hearts"
  on public.episode_hearts for select
  using (true);

drop policy if exists "Users heart episodes" on public.episode_hearts;
create policy "Users heart episodes"
  on public.episode_hearts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users unheart episodes" on public.episode_hearts;
create policy "Users unheart episodes"
  on public.episode_hearts for delete
  using (auth.uid() = user_id);

-- ── Reader progress (chapter saves, endings, checkpoints) ──────────────────────
create table if not exists public.reader_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  series_id text not null,
  data jsonb not null default '{"endingsUnlocked":[],"episodes":{}}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, series_id)
);

create index if not exists reader_progress_user_updated_idx
  on public.reader_progress (user_id, updated_at desc);

alter table public.reader_progress enable row level security;

drop policy if exists "Users read own progress" on public.reader_progress;
create policy "Users read own progress"
  on public.reader_progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own progress" on public.reader_progress;
create policy "Users insert own progress"
  on public.reader_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own progress" on public.reader_progress;
create policy "Users update own progress"
  on public.reader_progress for update
  using (auth.uid() = user_id);

-- ── Episode reads (one row per reader per chapter — powers weekly read stats) ─
create table if not exists public.episode_reads (
  id uuid primary key default gen_random_uuid(),
  series_id text not null,
  episode_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  reader_key text not null,
  read_at timestamptz not null default now()
);

-- Keep newest row when the same reader re-opens the same chapter.
delete from public.episode_reads
where id in (
  select id
  from (
    select id,
      row_number() over (
        partition by series_id, episode_id, reader_key
        order by read_at desc
      ) as rn
    from public.episode_reads
  ) ranked
  where rn > 1
);

create unique index if not exists episode_reads_series_episode_reader_uniq
  on public.episode_reads (series_id, episode_id, reader_key);

create index if not exists episode_reads_week_idx
  on public.episode_reads (read_at desc);

create index if not exists episode_reads_series_week_idx
  on public.episode_reads (series_id, read_at desc);

alter table public.episode_reads enable row level security;

drop policy if exists "Anyone logs episode reads" on public.episode_reads;
create policy "Anyone logs episode reads"
  on public.episode_reads for insert
  with check (char_length(trim(reader_key)) > 0);

-- Log or refresh a chapter read (one count per reader per chapter; re-opens update read_at).
create or replace function public.log_episode_read(
  p_series_id text,
  p_episode_id text,
  p_reader_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(trim(coalesce(p_series_id, ''))) = 0
     or char_length(trim(coalesce(p_episode_id, ''))) = 0
     or char_length(trim(coalesce(p_reader_key, ''))) = 0 then
    return;
  end if;

  insert into public.episode_reads (series_id, episode_id, reader_key, user_id, read_at)
  values (p_series_id, p_episode_id, p_reader_key, auth.uid(), now())
  on conflict (series_id, episode_id, reader_key)
  do update set
    read_at = excluded.read_at,
    user_id = coalesce(excluded.user_id, public.episode_reads.user_id);
end;
$$;

revoke all on function public.log_episode_read(text, text, text) from public;
grant execute on function public.log_episode_read(text, text, text) to anon, authenticated;

-- Verify:
-- select count(*) from public.episode_comments;
-- select count(*) from public.episode_hearts;
-- select count(*) from public.reader_progress;
-- select count(*) from public.episode_reads;

-- Public aggregate stats for the home page (no row-level reader data exposed).
create or replace function public.platform_reader_stats()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with weekly_reads as (
    select series_id, episode_id, coalesce(user_id::text, reader_key) as reader_id
    from public.episode_reads
    where read_at >= now() - interval '7 days'
  ),
  weekly_unique as (
    select distinct series_id, episode_id, reader_id
    from weekly_reads
  )
  select jsonb_build_object(
    'chapters_read_this_week', (
      select count(*)::int from weekly_unique
    ),
    'chapters_by_series', coalesce((
      select jsonb_object_agg(series_id, chapter_count)
      from (
        select series_id, count(*)::int as chapter_count
        from weekly_unique
        group by series_id
      ) weekly
    ), '{}'::jsonb),
    -- Legacy keys (distinct active readers) — kept for older clients
    'readers_this_week', (
      select count(distinct reader_id)::int from weekly_reads
    ),
    'readers_by_series', coalesce((
      select jsonb_object_agg(series_id, reader_count)
      from (
        select series_id, count(distinct reader_id)::int as reader_count
        from weekly_reads
        group by series_id
      ) weekly
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.platform_reader_stats() from public;
grant execute on function public.platform_reader_stats() to anon, authenticated;
