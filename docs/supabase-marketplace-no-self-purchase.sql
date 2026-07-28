-- FULL SCRIPT — paste this entire file into Supabase SQL Editor (not just the IF line).
-- 1) Blocks buying your own listing going forward
-- 2) Removes past self-purchases and refunds Ducats spent on them

-- ── A) Fix purchase RPC ─────────────────────────────────────────────────────
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

  begin
    v_share := public._ducat_creator_share();
  exception when undefined_function then
    v_share := 0.8;
  end;

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

  if v_creator_ducats > 0 then
    update public.profiles
    set creator_earned_ducats = creator_earned_ducats + v_creator_ducats
    where id = v_listing.seller_id;
  end if;

  begin
    if v_platform_ducats > 0 then
      perform public._credit_platform_treasury(v_platform_ducats);
    end if;
  exception when undefined_function then
    null;
  end;

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
    'seller_id', v_row.seller_id,
    'seller_name', v_row.seller_name,
    'is_seller', auth.uid() is not null and v_row.seller_id = auth.uid(),
    'owned', v_owned,
    'created_at', v_row.created_at
  );
end;
$$;

-- ── B) Clean up past self-purchases + refund Ducats ─────────────────────────
-- Preview first (optional):
-- select mp.*, l.title, l.seller_id
-- from public.marketplace_purchases mp
-- join public.marketplace_listings l on l.id = mp.listing_id
-- where mp.user_id = l.seller_id;

do $$
declare
  r record;
begin
  for r in
    select
      mp.user_id,
      mp.listing_id,
      coalesce(mp.ducats_spent, 0) as spent
    from public.marketplace_purchases mp
    join public.marketplace_listings l on l.id = mp.listing_id
    where mp.user_id = l.seller_id
  loop
    -- Refund Ducats spent on the silly self-buy
    if r.spent > 0 then
      update public.profiles
      set ducat_balance = coalesce(ducat_balance, 0) + r.spent
      where id = r.user_id;
    end if;

    -- Fix inflated purchase count
    update public.marketplace_listings
    set purchase_count = greatest(0, coalesce(purchase_count, 0) - 1),
        updated_at = now()
    where id = r.listing_id;

    delete from public.marketplace_purchases
    where user_id = r.user_id and listing_id = r.listing_id;
  end loop;
end $$;

-- Verify nothing left:
-- select count(*) as leftover_self_buys
-- from public.marketplace_purchases mp
-- join public.marketplace_listings l on l.id = mp.listing_id
-- where mp.user_id = l.seller_id;
