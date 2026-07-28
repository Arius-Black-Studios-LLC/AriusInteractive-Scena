-- Ducat economics v2 — 80/20 spend split, $0.09 market / $0.05 cash-out, platform treasury
-- Run in Supabase SQL Editor after supabase-wallet.sql
-- Safe to re-run (replaces functions).

-- Platform treasury: promotional / "sales tax" Ducats (not USD — spend in-app on Arleco jams, etc.)
create table if not exists public.platform_ducat_treasury (
  id int primary key default 1 check (id = 1),
  balance int not null default 0 check (balance >= 0),
  lifetime_collected int not null default 0 check (lifetime_collected >= 0),
  updated_at timestamptz not null default now()
);

insert into public.platform_ducat_treasury (id, balance, lifetime_collected)
values (1, 0, 0)
on conflict (id) do nothing;

alter table public.platform_ducat_treasury enable row level security;
-- No public policies — query as admin in SQL Editor only.

create or replace function public._credit_platform_treasury(p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  p_amount := greatest(0, coalesce(p_amount, 0));
  if p_amount <= 0 then return; end if;
  update public.platform_ducat_treasury
  set balance = balance + p_amount,
      lifetime_collected = lifetime_collected + p_amount,
      updated_at = now()
  where id = 1;
end;
$$;

-- Constants (must match docs/scena-wallet.js)
create or replace function public._ducat_creator_share()
returns numeric language sql immutable as $$ select 0.80; $$;

create or replace function public._ducat_reference_retail_cents()
returns int language sql immutable as $$ select 9; $$;

create or replace function public._ducat_cashout_cents_per_ducat()
returns int language sql immutable as $$ select 5; $$;

create or replace function public._ducat_cashout_cents(p_ducats int)
returns int language sql immutable as $$
  select floor(greatest(p_ducats, 0) * public._ducat_cashout_cents_per_ducat())::int;
$$;

-- Chapter unlock: 80% creator earned, 20% platform treasury
create or replace function public.unlock_chapter_with_ducats(
  p_series_id text,
  p_episode_id text,
  p_cost int,
  p_creator_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_balance int;
  v_creator uuid;
  v_creator_ducats int;
  v_platform_ducats int;
  v_share numeric;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_cost is null or p_cost <= 0 then raise exception 'Invalid unlock cost'; end if;

  v_share := public._ducat_creator_share();
  v_creator_ducats := floor(p_cost * v_share);
  v_platform_ducats := p_cost - v_creator_ducats;
  v_creator := public._resolve_series_creator(p_series_id, p_creator_id);

  select ducat_balance into v_balance from public.profiles where id = auth.uid() for update;
  if v_balance is null then raise exception 'Profile not found'; end if;

  if exists (
    select 1 from public.chapter_unlocks
    where user_id = auth.uid() and series_id = p_series_id and episode_id = p_episode_id
  ) then
    return jsonb_build_object('balance', v_balance, 'already', true);
  end if;

  if v_balance < p_cost then raise exception 'Not enough Ducats'; end if;

  update public.profiles
  set ducat_balance = ducat_balance - p_cost
  where id = auth.uid()
  returning ducat_balance into v_balance;

  if v_creator is not null and v_creator <> auth.uid() and v_creator_ducats > 0 then
    update public.profiles
    set creator_earned_ducats = creator_earned_ducats + v_creator_ducats
    where id = v_creator;

    insert into public.creator_earnings (
      creator_id, reader_id, series_id, episode_id,
      ducats_spent, creator_ducats, platform_ducats
    ) values (
      v_creator, auth.uid(), p_series_id, p_episode_id,
      p_cost, v_creator_ducats, v_platform_ducats
    );
  end if;

  if v_platform_ducats > 0 then
    perform public._credit_platform_treasury(v_platform_ducats);
  end if;

  insert into public.chapter_unlocks (
    user_id, series_id, episode_id, creator_id,
    ducats_spent, creator_ducats, platform_ducats
  ) values (
    auth.uid(), p_series_id, p_episode_id, v_creator,
    p_cost, v_creator_ducats, v_platform_ducats
  );

  return jsonb_build_object(
    'balance', v_balance,
    'creator_credited', v_creator_ducats,
    'platform_credited', v_platform_ducats
  );
end;
$$;

-- Marketplace purchase: same 80/20 split + treasury credit
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

  if v_listing.seller_id = auth.uid() then
    raise exception 'You cannot buy your own listing — it is already in your library.';
  end if;

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

  if v_platform_ducats > 0 then
    perform public._credit_platform_treasury(v_platform_ducats);
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
    'spent', v_listing.price_ducats,
    'creator_credited', v_creator_ducats,
    'platform_credited', v_platform_ducats
  );
end;
$$;

-- Admin: check promotional Ducat pool
-- select balance, lifetime_collected from public.platform_ducat_treasury where id = 1;

notify pgrst, 'reload schema';
