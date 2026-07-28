-- Arleco platform admin + in-site staff picks
-- Run once in Supabase Dashboard → SQL Editor.
--
-- After this:
--   1. Set YOUR account as admin (see bootstrap at bottom).
--   2. Log in on the site → Account header shows "Staff picks" → /admin/featured
--
-- Requires: supabase-setup.sql, supabase-cloud-setup.sql, supabase-admin-featured.sql

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.profiles_protect_admin_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if NEW.is_admin is distinct from OLD.is_admin
       and current_user in ('authenticated', 'anon') then
      raise exception 'Admin flag is server-managed';
    end if;
  end if;
  if TG_OP = 'INSERT' then
    if coalesce(NEW.is_admin, false) = true
       and current_user in ('authenticated', 'anon') then
      raise exception 'Admin flag is server-managed';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_admin_column on public.profiles;
create trigger profiles_protect_admin_column
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_admin_column();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

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
    coalesce(nullif(ss.data->>'shortDescription', ''), nullif(ss.data->>'description', ''), ''),
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
    coalesce((ss.data->>'featured')::boolean, false) desc,
    nullif(ss.data->>'featuredOrder', '')::int nulls last,
    ss.updated_at desc;
end;
$$;

revoke all on function public.admin_list_published_series() from public;
grant execute on function public.admin_list_published_series() to authenticated;

create or replace function public.admin_set_series_featured(
  p_owner_id uuid,
  p_series_id text,
  p_featured boolean,
  p_featured_order int default null,
  p_featured_eyebrow text default null
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

  if p_owner_id is null or coalesce(trim(p_series_id), '') = '' then
    raise exception 'Series not found';
  end if;

  select ss.data into v_data
  from public.studio_series ss
  where ss.user_id = p_owner_id and ss.id = p_series_id;

  if v_data is null then
    raise exception 'Series not found';
  end if;

  if p_featured then
    v_data := jsonb_set(v_data, '{featured}', 'true'::jsonb, true);
    if p_featured_order is not null then
      v_data := jsonb_set(v_data, '{featuredOrder}', to_jsonb(p_featured_order), true);
    else
      v_data := v_data - 'featuredOrder';
    end if;
    if p_featured_eyebrow is not null and length(trim(p_featured_eyebrow)) > 0 then
      v_data := jsonb_set(v_data, '{featuredEyebrow}', to_jsonb(trim(p_featured_eyebrow)), true);
    else
      v_data := v_data - 'featuredEyebrow';
    end if;
  else
    v_data := v_data - 'featured' - 'featuredOrder' - 'featuredEyebrow';
  end if;

  update public.studio_series
  set data = v_data,
      updated_at = now()
  where user_id = p_owner_id and id = p_series_id;

  return v_data;
end;
$$;

revoke all on function public.admin_set_series_featured(uuid, text, boolean, int, text) from public;
grant execute on function public.admin_set_series_featured(uuid, text, boolean, int, text) to authenticated;

-- ── Bootstrap: make YOUR account admin ───────────────────────────────────────
-- If you see "column is_admin does not exist", run docs/supabase-admin-bootstrap.sql first.
-- update public.profiles
-- set is_admin = true
-- where lower(email) = lower('you@example.com');
