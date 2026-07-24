-- Arleco asset marketplace — Ducats packs for engine-ready assets
-- Run after supabase-wallet.sql

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null check (category in ('character', 'stage', 'item', 'audio', 'pack')),
  price_ducats int not null default 0 check (price_ducats >= 0),
  preview_data_url text,
  bundle jsonb not null default '{}'::jsonb,
  status text not null default 'live' check (status in ('draft', 'live', 'removed')),
  purchase_count int not null default 0 check (purchase_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listings_live_idx
  on public.marketplace_listings (status, category, created_at desc)
  where status = 'live';

create index if not exists marketplace_listings_seller_idx
  on public.marketplace_listings (seller_id, created_at desc);

create table if not exists public.marketplace_purchases (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings (id) on delete cascade,
  ducats_spent int not null default 0 check (ducats_spent >= 0),
  creator_ducats int not null default 0 check (creator_ducats >= 0),
  platform_ducats int not null default 0 check (platform_ducats >= 0),
  purchased_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists marketplace_purchases_user_idx
  on public.marketplace_purchases (user_id, purchased_at desc);

alter table public.marketplace_listings enable row level security;
alter table public.marketplace_purchases enable row level security;

drop policy if exists "Anyone reads live listings" on public.marketplace_listings;
create policy "Anyone reads live listings"
  on public.marketplace_listings for select
  using (status = 'live' or auth.uid() = seller_id);

drop policy if exists "Users read own purchases" on public.marketplace_purchases;
create policy "Users read own purchases"
  on public.marketplace_purchases for select
  using (auth.uid() = user_id);

create or replace function public.browse_marketplace_listings(
  p_category text default null,
  p_query text default null,
  p_limit int default 48
)
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.purchase_count desc, t.created_at desc)
    from (
      select
        l.id,
        l.title,
        l.description,
        l.category,
        l.price_ducats,
        l.preview_data_url,
        l.purchase_count,
        l.created_at,
        coalesce(p.display_name, p.username, 'Creator') as seller_name
      from public.marketplace_listings l
      left join public.profiles p on p.id = l.seller_id
      where l.status = 'live'
        and (p_category is null or p_category = '' or l.category = p_category)
        and (
          p_query is null or p_query = ''
          or l.title ilike '%' || p_query || '%'
          or l.description ilike '%' || p_query || '%'
        )
      order by l.purchase_count desc, l.created_at desc
      limit greatest(1, least(coalesce(p_limit, 48), 100))
    ) t
  ), '[]'::jsonb);
end;
$$;

create or replace function public.marketplace_listing_detail(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  v_row record;
  v_owned boolean := false;
begin
  select
    l.*,
    coalesce(p.display_name, p.username, 'Creator') as seller_name
  into v_row
  from public.marketplace_listings l
  left join public.profiles p on p.id = l.seller_id
  where l.id = p_listing_id and l.status = 'live';

  if not found then return null; end if;

  if auth.uid() is not null then
    select exists (
      select 1 from public.marketplace_purchases
      where user_id = auth.uid() and listing_id = p_listing_id
    ) into v_owned;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'title', v_row.title,
    'description', v_row.description,
    'category', v_row.category,
    'price_ducats', v_row.price_ducats,
    'preview_data_url', v_row.preview_data_url,
    'purchase_count', v_row.purchase_count,
    'seller_name', v_row.seller_name,
    'owned', v_owned,
    'created_at', v_row.created_at
  );
end;
$$;

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
  if p_category not in ('character', 'stage', 'item', 'audio', 'pack') then
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

create or replace function public.purchase_marketplace_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_listing record;
  v_balance int;
  v_creator_ducats int;
  v_platform_ducats int;
  v_share numeric;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  select * into v_listing
  from public.marketplace_listings
  where id = p_listing_id and status = 'live'
  for update;

  if not found then raise exception 'Listing not found'; end if;

  if exists (
    select 1 from public.marketplace_purchases
    where user_id = auth.uid() and listing_id = p_listing_id
  ) then
    return jsonb_build_object(
      'owned', true,
      'bundle', v_listing.bundle,
      'balance', (select ducat_balance from public.profiles where id = auth.uid())
    );
  end if;

  if v_listing.price_ducats <= 0 then
    insert into public.marketplace_purchases (
      user_id, listing_id, ducats_spent, creator_ducats, platform_ducats
    ) values (auth.uid(), p_listing_id, 0, 0, 0);

    update public.marketplace_listings
    set purchase_count = purchase_count + 1, updated_at = now()
    where id = p_listing_id;

    return jsonb_build_object(
      'owned', true,
      'free', true,
      'bundle', v_listing.bundle,
      'balance', (select coalesce(ducat_balance, 0) from public.profiles where id = auth.uid())
    );
  end if;

  v_share := public._ducat_creator_share();
  v_creator_ducats := floor(v_listing.price_ducats * v_share);
  v_platform_ducats := v_listing.price_ducats - v_creator_ducats;

  select ducat_balance into v_balance
  from public.profiles where id = auth.uid() for update;

  if v_balance < v_listing.price_ducats then
    raise exception 'Not enough Ducats';
  end if;

  update public.profiles
  set ducat_balance = ducat_balance - v_listing.price_ducats
  where id = auth.uid()
  returning ducat_balance into v_balance;

  if v_listing.seller_id <> auth.uid() and v_creator_ducats > 0 then
    update public.profiles
    set creator_earned_ducats = creator_earned_ducats + v_creator_ducats
    where id = v_listing.seller_id;
  end if;

  insert into public.marketplace_purchases (
    user_id, listing_id, ducats_spent, creator_ducats, platform_ducats
  ) values (
    auth.uid(), p_listing_id, v_listing.price_ducats, v_creator_ducats, v_platform_ducats
  );

  update public.marketplace_listings
  set purchase_count = purchase_count + 1, updated_at = now()
  where id = p_listing_id;

  return jsonb_build_object(
    'owned', true,
    'bundle', v_listing.bundle,
    'balance', v_balance,
    'spent', v_listing.price_ducats
  );
end;
$$;

grant execute on function public.browse_marketplace_listings(text, text, int) to anon, authenticated;
grant execute on function public.marketplace_listing_detail(uuid) to anon, authenticated;
grant execute on function public.publish_marketplace_listing(text, text, text, int, jsonb, text) to authenticated;
grant execute on function public.purchase_marketplace_listing(uuid) to authenticated;
