-- Arleco platform moderation (admin tools + user reports)
-- Run AFTER: supabase-setup.sql, supabase-cloud-setup.sql, supabase-reader-data.sql,
--            supabase-admin-featured.sql, supabase-marketplace.sql (marketplace section optional)
--
-- Enables /admin/moderation for is_admin accounts.

-- ── Comments: soft-hide ──────────────────────────────────────────────────────
alter table public.episode_comments
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users (id) on delete set null,
  add column if not exists hidden_reason text;

create index if not exists episode_comments_recent_idx
  on public.episode_comments (created_at desc);

drop policy if exists "Anyone reads episode comments" on public.episode_comments;
create policy "Anyone reads episode comments"
  on public.episode_comments for select
  using (
    hidden_at is null
    or user_id = auth.uid()
    or public.is_platform_admin()
  );

-- ── Series: hide from public discover/play ───────────────────────────────────
drop policy if exists "Public read published series" on public.studio_series;
create policy "Public read published series"
  on public.studio_series for select
  using (
    auth.uid() = user_id
    or (
      coalesce((data->>'adminHidden')::boolean, false) = false
      and (
        (data->>'status') = 'published'
        or exists (
          select 1
          from jsonb_array_elements(coalesce(data->'episodes', '[]'::jsonb)) ep
          where coalesce(ep->>'isLive', 'false') = 'true'
        )
      )
    )
    or public.is_platform_admin()
  );

-- ── Game jams (cloud copy for cross-user browse + moderation) ─────────────────
create table if not exists public.game_jams (
  id text primary key,
  host_user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_reason text,
  updated_at timestamptz not null default now()
);

create index if not exists game_jams_host_updated_idx
  on public.game_jams (host_user_id, updated_at desc);

alter table public.game_jams enable row level security;

drop policy if exists "Anyone reads public game jams" on public.game_jams;
create policy "Anyone reads public game jams"
  on public.game_jams for select
  using (
    hidden_at is null
    and coalesce(data->>'status', '') = 'published'
  );

drop policy if exists "Hosts read own game jams" on public.game_jams;
create policy "Hosts read own game jams"
  on public.game_jams for select
  using (auth.uid() = host_user_id or public.is_platform_admin());

drop policy if exists "Hosts insert own game jams" on public.game_jams;
create policy "Hosts insert own game jams"
  on public.game_jams for insert
  to authenticated
  with check (auth.uid() = host_user_id);

drop policy if exists "Hosts update own game jams" on public.game_jams;
create policy "Hosts update own game jams"
  on public.game_jams for update
  to authenticated
  using (auth.uid() = host_user_id)
  with check (auth.uid() = host_user_id);

-- ── User reports ─────────────────────────────────────────────────────────────
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('comment', 'series', 'jam', 'listing')),
  target_id text not null,
  target_meta jsonb not null default '{}'::jsonb,
  reason text not null check (char_length(trim(reason)) > 0),
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_reports_open_idx
  on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

drop policy if exists "Users insert own reports" on public.content_reports;
create policy "Users insert own reports"
  on public.content_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

-- ── User report RPC ───────────────────────────────────────────────────────────
create or replace function public.submit_content_report(
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_details text default '',
  p_target_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to report content';
  end if;
  if coalesce(trim(p_target_id), '') = '' then
    raise exception 'Invalid report target';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Reason is required';
  end if;

  insert into public.content_reports (
    reporter_id, target_type, target_id, target_meta, reason, details
  ) values (
    auth.uid(),
    p_target_type,
    trim(p_target_id),
    coalesce(p_target_meta, '{}'::jsonb),
    trim(p_reason),
    coalesce(p_details, '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_content_report(text, text, text, text, jsonb) from public;
grant execute on function public.submit_content_report(text, text, text, text, jsonb) to authenticated;

-- ── Admin moderation RPCs ───────────────────────────────────────────────────
create or replace function public.admin_list_recent_comments(p_limit int default 80)
returns table (
  comment_id uuid,
  series_id text,
  episode_id text,
  user_id uuid,
  author_name text,
  body text,
  created_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;

  return query
  select
    c.id,
    c.series_id,
    c.episode_id,
    c.user_id,
    coalesce(c.author->>'displayName', 'Reader'),
    c.body,
    c.created_at,
    c.hidden_at,
    c.hidden_reason
  from public.episode_comments c
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 200));
end;
$$;

revoke all on function public.admin_list_recent_comments(int) from public;
grant execute on function public.admin_list_recent_comments(int) to authenticated;

create or replace function public.admin_hide_comment(
  p_comment_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  update public.episode_comments
  set hidden_at = now(),
      hidden_by = auth.uid(),
      hidden_reason = nullif(trim(p_reason), '')
  where id = p_comment_id;
  if not found then
    raise exception 'Comment not found';
  end if;
end;
$$;

revoke all on function public.admin_hide_comment(uuid, text) from public;
grant execute on function public.admin_hide_comment(uuid, text) to authenticated;

create or replace function public.admin_unhide_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  update public.episode_comments
  set hidden_at = null,
      hidden_by = null,
      hidden_reason = null
  where id = p_comment_id;
  if not found then
    raise exception 'Comment not found';
  end if;
end;
$$;

revoke all on function public.admin_unhide_comment(uuid) from public;
grant execute on function public.admin_unhide_comment(uuid) to authenticated;

create or replace function public.admin_set_series_moderation(
  p_owner_id uuid,
  p_series_id text,
  p_hidden boolean,
  p_reason text default '',
  p_clear_descriptions boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;

  select ss.data into v_data
  from public.studio_series ss
  where ss.user_id = p_owner_id and ss.id = p_series_id;

  if v_data is null then
    raise exception 'Series not found';
  end if;

  if p_hidden then
    v_data := jsonb_set(v_data, '{adminHidden}', 'true'::jsonb, true);
    v_data := jsonb_set(
      v_data,
      '{adminHiddenReason}',
      to_jsonb(coalesce(nullif(trim(p_reason), ''), 'Removed by moderation')),
      true
    );
    v_data := v_data - 'featured' - 'featuredOrder' - 'featuredEyebrow';
    if p_clear_descriptions then
      v_data := jsonb_set(v_data, '{shortDescription}', '""'::jsonb, true);
      v_data := jsonb_set(v_data, '{longDescription}', '""'::jsonb, true);
    end if;
  else
    v_data := v_data - 'adminHidden' - 'adminHiddenReason';
  end if;

  update public.studio_series
  set data = v_data,
      updated_at = now()
  where user_id = p_owner_id and id = p_series_id;

  return v_data;
end;
$$;

revoke all on function public.admin_set_series_moderation(uuid, text, boolean, text, boolean) from public;
grant execute on function public.admin_set_series_moderation(uuid, text, boolean, text, boolean) to authenticated;

-- Extends admin_list_published_series with moderation columns; must drop first if featured SQL ran earlier.
drop function if exists public.admin_list_published_series();

create or replace function public.admin_list_published_series()
returns table (
  series_id text,
  owner_id uuid,
  title text,
  description text,
  thumbnail_data_url text,
  banner_data_url text,
  featured boolean,
  featured_order int,
  featured_eyebrow text,
  live_chapter_count int,
  admin_hidden boolean,
  admin_hidden_reason text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;

  return query
  select
    ss.id,
    ss.user_id,
    coalesce(ss.data->>'title', 'Untitled'),
    coalesce(nullif(ss.data->>'shortDescription', ''), nullif(ss.data->>'longDescription', ''), nullif(ss.data->>'description', ''), ''),
    ss.data->>'thumbnailDataUrl',
    ss.data->>'bannerDataUrl',
    coalesce((ss.data->>'featured')::boolean, false),
    nullif(ss.data->>'featuredOrder', '')::int,
    nullif(trim(ss.data->>'featuredEyebrow'), ''),
    (
      select count(*)::int
      from jsonb_array_elements(coalesce(ss.data->'episodes', '[]'::jsonb)) ep
      where coalesce(ep->>'isLive', 'false') = 'true'
    ),
    coalesce((ss.data->>'adminHidden')::boolean, false),
    nullif(trim(ss.data->>'adminHiddenReason'), ''),
    ss.updated_at
  from public.studio_series ss
  where coalesce(ss.data->>'templateSource', '') = ''
    and (
      (ss.data->>'status') = 'published'
      or exists (
        select 1
        from jsonb_array_elements(coalesce(ss.data->'episodes', '[]'::jsonb)) ep
        where coalesce(ep->>'isLive', 'false') = 'true'
      )
    )
  order by
    coalesce((ss.data->>'adminHidden')::boolean, false) asc,
    coalesce((ss.data->>'featured')::boolean, false) desc,
    nullif(ss.data->>'featuredOrder', '')::int nulls last,
    ss.updated_at desc;
end;
$$;

revoke all on function public.admin_list_published_series() from public;
grant execute on function public.admin_list_published_series() to authenticated;

create or replace function public.admin_list_game_jams(p_limit int default 80)
returns table (
  jam_id text,
  host_user_id uuid,
  host_name text,
  title text,
  tagline text,
  rules text,
  status text,
  submission_count int,
  hidden_at timestamptz,
  hidden_reason text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;

  return query
  select
    gj.id,
    gj.host_user_id,
    coalesce(gj.data->>'hostName', p.display_name, 'Host'),
    coalesce(gj.data->>'title', 'Untitled jam'),
    coalesce(gj.data->>'tagline', gj.data->>'theme', ''),
    coalesce(gj.data->>'rules', ''),
    coalesce(gj.data->>'status', 'draft'),
    jsonb_array_length(coalesce(gj.data->'submissions', '[]'::jsonb))::int,
    gj.hidden_at,
    gj.hidden_reason,
    gj.updated_at
  from public.game_jams gj
  left join public.profiles p on p.id = gj.host_user_id
  order by gj.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 200));
end;
$$;

revoke all on function public.admin_list_game_jams(int) from public;
grant execute on function public.admin_list_game_jams(int) to authenticated;

create or replace function public.admin_hide_game_jam(
  p_jam_id text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  update public.game_jams
  set hidden_at = now(),
      hidden_by = auth.uid(),
      hidden_reason = nullif(trim(p_reason), ''),
      updated_at = now()
  where id = p_jam_id;
  if not found then
    raise exception 'Jam not found';
  end if;
end;
$$;

revoke all on function public.admin_hide_game_jam(text, text) from public;
grant execute on function public.admin_hide_game_jam(text, text) to authenticated;

create or replace function public.admin_unhide_game_jam(p_jam_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  update public.game_jams
  set hidden_at = null,
      hidden_by = null,
      hidden_reason = null,
      updated_at = now()
  where id = p_jam_id;
  if not found then
    raise exception 'Jam not found';
  end if;
end;
$$;

revoke all on function public.admin_unhide_game_jam(text) from public;
grant execute on function public.admin_unhide_game_jam(text) to authenticated;

create or replace function public.admin_list_marketplace_listings(p_limit int default 80)
returns table (
  listing_id uuid,
  seller_id uuid,
  seller_name text,
  title text,
  description text,
  category text,
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;

  return query
  select
    l.id,
    l.seller_id,
    coalesce(p.display_name, p.username, 'Creator'),
    l.title,
    l.description,
    l.category,
    l.status,
    l.updated_at
  from public.marketplace_listings l
  left join public.profiles p on p.id = l.seller_id
  where l.status in ('live', 'draft')
  order by l.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 200));
end;
$$;

revoke all on function public.admin_list_marketplace_listings(int) from public;
grant execute on function public.admin_list_marketplace_listings(int) to authenticated;

create or replace function public.admin_remove_marketplace_listing(
  p_listing_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  update public.marketplace_listings
  set status = 'removed',
      description = case
        when coalesce(trim(p_reason), '') = '' then description
        else left('[Removed by moderation: ' || trim(p_reason) || '] ' || description, 4000)
      end,
      updated_at = now()
  where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
end;
$$;

revoke all on function public.admin_remove_marketplace_listing(uuid, text) from public;
grant execute on function public.admin_remove_marketplace_listing(uuid, text) to authenticated;

create or replace function public.admin_list_content_reports(p_limit int default 80)
returns table (
  report_id uuid,
  target_type text,
  target_id text,
  target_meta jsonb,
  reason text,
  details text,
  status text,
  reporter_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;

  return query
  select
    r.id,
    r.target_type,
    r.target_id,
    r.target_meta,
    r.reason,
    r.details,
    r.status,
    coalesce(p.display_name, 'Reader'),
    r.created_at
  from public.content_reports r
  left join public.profiles p on p.id = r.reporter_id
  order by
    case when r.status = 'open' then 0 else 1 end,
    r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 200));
end;
$$;

revoke all on function public.admin_list_content_reports(int) from public;
grant execute on function public.admin_list_content_reports(int) to authenticated;

create or replace function public.admin_resolve_content_report(
  p_report_id uuid,
  p_status text default 'resolved'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Invalid status';
  end if;
  update public.content_reports
  set status = p_status,
      resolved_at = now(),
      resolved_by = auth.uid()
  where id = p_report_id;
  if not found then
    raise exception 'Report not found';
  end if;
end;
$$;

revoke all on function public.admin_resolve_content_report(uuid, text) from public;
grant execute on function public.admin_resolve_content_report(uuid, text) to authenticated;
