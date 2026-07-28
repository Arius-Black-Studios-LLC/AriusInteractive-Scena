-- Seller edit / remove for marketplace listings
-- Run in Supabase SQL editor after supabase-marketplace.sql

create or replace function public.update_marketplace_listing(
  p_listing_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_price_ducats int
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row public.marketplace_listings%rowtype;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_listing_id is null then raise exception 'Missing listing'; end if;
  if p_title is null or length(trim(p_title)) < 2 then raise exception 'Title too short'; end if;
  if p_category not in ('character', 'stage', 'item', 'audio', 'ui', 'pack') then
    raise exception 'Invalid category';
  end if;
  if p_price_ducats is null or p_price_ducats < 0 then raise exception 'Invalid price'; end if;

  update public.marketplace_listings
  set
    title = trim(p_title),
    description = coalesce(trim(p_description), ''),
    category = p_category,
    price_ducats = p_price_ducats,
    status = 'live',
    updated_at = now()
  where id = p_listing_id
    and seller_id = auth.uid()
    and status <> 'removed'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Listing not found or not yours';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'title', v_row.title,
    'description', v_row.description,
    'category', v_row.category,
    'price_ducats', v_row.price_ducats,
    'status', v_row.status
  );
end;
$$;

create or replace function public.remove_marketplace_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_listing_id is null then raise exception 'Missing listing'; end if;

  update public.marketplace_listings
  set status = 'removed', updated_at = now()
  where id = p_listing_id
    and seller_id = auth.uid()
    and status <> 'removed'
  returning id into v_id;

  if v_id is null then
    raise exception 'Listing not found or not yours';
  end if;

  return jsonb_build_object('id', v_id, 'status', 'removed');
end;
$$;

grant execute on function public.update_marketplace_listing(uuid, text, text, text, int) to authenticated;
grant execute on function public.remove_marketplace_listing(uuid) to authenticated;
