-- Safe marketplace admin RPCs when marketplace_listings may not exist yet.
-- Run after supabase-admin-moderation.sql if Moderation → Marketplace errors with:
--   relation "public.marketplace_listings" does not exist
--
-- Optional: also run docs/supabase-marketplace.sql to enable the asset store.

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

  if to_regclass('public.marketplace_listings') is null then
    return;
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
  if to_regclass('public.marketplace_listings') is null then
    raise exception 'Marketplace is not set up yet. Run docs/supabase-marketplace.sql.';
  end if;

  update public.marketplace_listings
  set status = 'removed',
      updated_at = now()
  where id = p_listing_id;

  if not found then
    raise exception 'Listing not found';
  end if;
end;
$$;

revoke all on function public.admin_remove_marketplace_listing(uuid, text) from public;
grant execute on function public.admin_remove_marketplace_listing(uuid, text) to authenticated;
