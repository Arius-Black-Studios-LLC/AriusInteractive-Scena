-- Creator moderation notices + open-report count for admin nav badge.
-- Run AFTER docs/supabase-admin-moderation.sql

create table if not exists public.creator_moderation_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('series', 'jam', 'listing', 'comment')),
  target_id text not null,
  title text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists creator_moderation_notices_user_idx
  on public.creator_moderation_notices (user_id, created_at desc);

alter table public.creator_moderation_notices enable row level security;

drop policy if exists "Creators read own moderation notices" on public.creator_moderation_notices;
create policy "Creators read own moderation notices"
  on public.creator_moderation_notices for select
  using (auth.uid() = user_id);

drop policy if exists "Creators mark own notices read" on public.creator_moderation_notices;
create policy "Creators mark own notices read"
  on public.creator_moderation_notices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.admin_notify_creator(
  p_user_id uuid,
  p_target_type text,
  p_target_id text,
  p_title text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  if p_user_id is null then
    raise exception 'Missing creator';
  end if;
  insert into public.creator_moderation_notices (user_id, target_type, target_id, title, reason)
  values (
    p_user_id,
    p_target_type,
    coalesce(p_target_id, ''),
    coalesce(nullif(trim(p_title), ''), 'Your content'),
    coalesce(nullif(trim(p_reason), ''), 'Removed by moderation')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_notify_creator(uuid, text, text, text, text) from public;
grant execute on function public.admin_notify_creator(uuid, text, text, text, text) to authenticated;

create or replace function public.list_my_moderation_notices(p_limit int default 40)
returns table (
  notice_id uuid,
  target_type text,
  target_id text,
  title text,
  reason text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  return query
  select n.id, n.target_type, n.target_id, n.title, n.reason, n.created_at, n.read_at
  from public.creator_moderation_notices n
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 100));
end;
$$;

revoke all on function public.list_my_moderation_notices(int) from public;
grant execute on function public.list_my_moderation_notices(int) to authenticated;

create or replace function public.mark_moderation_notice_read(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  update public.creator_moderation_notices
  set read_at = coalesce(read_at, now())
  where id = p_notice_id and user_id = auth.uid();
end;
$$;

revoke all on function public.mark_moderation_notice_read(uuid) from public;
grant execute on function public.mark_moderation_notice_read(uuid) to authenticated;

create or replace function public.admin_count_open_reports()
returns int
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  return (
    select count(*)::int
    from public.content_reports
    where status = 'open'
  );
end;
$$;

revoke all on function public.admin_count_open_reports() from public;
grant execute on function public.admin_count_open_reports() to authenticated;

-- Patch series moderation to notify the owner when delisted.
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
  v_title text;
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

  v_title := coalesce(nullif(trim(v_data->>'title'), ''), 'Your series');

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

  if p_hidden then
    perform public.admin_notify_creator(
      p_owner_id,
      'series',
      p_series_id,
      v_title,
      coalesce(nullif(trim(p_reason), ''), 'Removed by moderation')
    );
  end if;

  return v_data;
end;
$$;

grant execute on function public.admin_set_series_moderation(uuid, text, boolean, text, boolean) to authenticated;

create or replace function public.admin_hide_game_jam(
  p_jam_id text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_title text;
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  select host_user_id, title into v_host, v_title
  from public.game_jams
  where id = p_jam_id;
  if not found then
    raise exception 'Jam not found';
  end if;
  update public.game_jams
  set hidden_at = now(),
      hidden_by = auth.uid(),
      hidden_reason = nullif(trim(p_reason), ''),
      updated_at = now()
  where id = p_jam_id;
  if v_host is not null then
    perform public.admin_notify_creator(
      v_host,
      'jam',
      p_jam_id,
      coalesce(nullif(trim(v_title), ''), 'Your game jam'),
      coalesce(nullif(trim(p_reason), ''), 'Removed by moderation')
    );
  end if;
end;
$$;

grant execute on function public.admin_hide_game_jam(text, text) to authenticated;

create or replace function public.admin_remove_marketplace_listing(
  p_listing_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_title text;
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  if to_regclass('public.marketplace_listings') is null then
    raise exception 'Marketplace is not set up yet. Run docs/supabase-marketplace.sql.';
  end if;
  select seller_id, title into v_seller, v_title
  from public.marketplace_listings
  where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
  update public.marketplace_listings
  set status = 'removed',
      description = case
        when coalesce(trim(p_reason), '') = '' then description
        else left('[Removed by moderation: ' || trim(p_reason) || '] ' || description, 4000)
      end,
      updated_at = now()
  where id = p_listing_id;
  if v_seller is not null then
    perform public.admin_notify_creator(
      v_seller,
      'listing',
      p_listing_id::text,
      coalesce(nullif(trim(v_title), ''), 'Your listing'),
      coalesce(nullif(trim(p_reason), ''), 'Removed by moderation')
    );
  end if;
end;
$$;

grant execute on function public.admin_remove_marketplace_listing(uuid, text) to authenticated;
