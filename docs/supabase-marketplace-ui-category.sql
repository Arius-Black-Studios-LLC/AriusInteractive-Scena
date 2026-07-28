-- Add marketplace category: UI (Game UI kits)
-- Run in Supabase SQL editor after supabase-marketplace.sql

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_category_check;

alter table public.marketplace_listings
  add constraint marketplace_listings_category_check
  check (category in ('character', 'stage', 'item', 'audio', 'ui', 'pack'));

create or replace function public.publish_marketplace_listing(
  p_title text,
  p_description text,
  p_category text,
  p_price_ducats int,
  p_bundle jsonb,
  p_preview_data_url text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_title is null or length(trim(p_title)) < 2 then raise exception 'Title too short'; end if;
  if p_category not in ('character', 'stage', 'item', 'audio', 'ui', 'pack') then
    raise exception 'Invalid category';
  end if;
  if p_price_ducats is null or p_price_ducats < 0 then raise exception 'Invalid price'; end if;
  if p_bundle is null or p_bundle = '{}'::jsonb then raise exception 'Bundle is empty'; end if;

  insert into public.marketplace_listings (
    seller_id, title, description, category, price_ducats, bundle, preview_data_url, status
  ) values (
    auth.uid(),
    trim(p_title),
    coalesce(trim(p_description), ''),
    p_category,
    p_price_ducats,
    p_bundle,
    p_preview_data_url,
    'live'
  )
  returning id into v_id;

  return v_id;
end;
$$;
