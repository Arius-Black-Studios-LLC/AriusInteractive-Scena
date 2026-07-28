-- Temporary free pricing for marketplace listings entered in asset jams.
-- Run AFTER docs/supabase-marketplace.sql
-- Prefer also: docs/supabase-marketplace-ratings.sql, docs/supabase-admin-moderation.sql (game_jams).
-- While a listing is in an active asset jam (through judging end), purchases charge 0 Ducats.
-- List price stays on price_ducats and returns after voting ends.

alter table public.marketplace_listings
  add column if not exists jam_free_until timestamptz;

create index if not exists marketplace_listings_jam_free_idx
  on public.marketplace_listings (jam_free_until)
  where jam_free_until is not null;

create or replace function public.set_listing_jam_free_until(
  p_listing_id uuid,
  p_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_listing_id is null then raise exception 'Missing listing'; end if;
  if p_until is null then raise exception 'Missing jam end time'; end if;

  select id, seller_id, jam_free_until, price_ducats
  into v_row
  from public.marketplace_listings
  where id = p_listing_id
  for update;

  if not found then raise exception 'Listing not found'; end if;
  if v_row.seller_id is distinct from auth.uid() then
    raise exception 'Only the seller can mark a listing for jam free pricing';
  end if;

  update public.marketplace_listings
  set jam_free_until = case
        when jam_free_until is null or jam_free_until < p_until then p_until
        else jam_free_until
      end,
      updated_at = now()
  where id = p_listing_id
  returning jam_free_until into v_row.jam_free_until;

  return jsonb_build_object(
    'id', p_listing_id,
    'jam_free_until', v_row.jam_free_until,
    'price_ducats', v_row.price_ducats,
    'jam_free', v_row.jam_free_until is not null and v_row.jam_free_until > now()
  );
end;
$$;

revoke all on function public.set_listing_jam_free_until(uuid, timestamptz) from public;
grant execute on function public.set_listing_jam_free_until(uuid, timestamptz) to authenticated;

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
        l.jam_free_until,
        (l.jam_free_until is not null and l.jam_free_until > now()) as jam_free,
        case
          when l.jam_free_until is not null and l.jam_free_until > now() then 0
          else l.price_ducats
        end as effective_price_ducats,
        coalesce(p.display_name, p.username, 'Creator') as seller_name,
        coalesce(r.rating_avg, 0)::float8 as rating_avg,
        coalesce(r.rating_count, 0)::int as rating_count
      from public.marketplace_listings l
      left join public.profiles p on p.id = l.seller_id
      left join lateral (
        select round(avg(stars)::numeric, 2) as rating_avg, count(*)::int as rating_count
        from public.marketplace_ratings mr
        where mr.listing_id = l.id
      ) r on true
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
  v_avg numeric := 0;
  v_count int := 0;
  v_mine int := null;
  v_jam_free boolean := false;
begin
  select
    l.*,
    coalesce(p.display_name, p.username, 'Creator') as seller_name
  into v_row
  from public.marketplace_listings l
  left join public.profiles p on p.id = l.seller_id
  where l.id = p_listing_id and l.status = 'live';

  if not found then return null; end if;

  v_jam_free := v_row.jam_free_until is not null and v_row.jam_free_until > now();

  if auth.uid() is not null then
    select exists (
      select 1 from public.marketplace_purchases
      where user_id = auth.uid() and listing_id = p_listing_id
    ) into v_owned;
    select stars into v_mine
    from public.marketplace_ratings
    where user_id = auth.uid() and listing_id = p_listing_id;
  end if;

  select coalesce(round(avg(stars)::numeric, 2), 0), count(*)::int
    into v_avg, v_count
  from public.marketplace_ratings
  where listing_id = p_listing_id;

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
    'created_at', v_row.created_at,
    'jam_free_until', v_row.jam_free_until,
    'jam_free', v_jam_free,
    'effective_price_ducats', case when v_jam_free then 0 else v_row.price_ducats end,
    'rating_avg', v_avg,
    'rating_count', v_count,
    'my_rating', v_mine
  );
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
  v_charge int;
  v_jam_free boolean;
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

  v_jam_free := v_listing.jam_free_until is not null and v_listing.jam_free_until > now();

  -- Also honor live asset-jam entries even if jam_free_until was not stamped yet
  if not v_jam_free and exists (
    select 1
    from public.game_jams gj
    where coalesce(gj.data->>'jamType', 'game') = 'asset'
      and coalesce(gj.data->>'status', '') = 'published'
      and coalesce(gj.hidden_at, null) is null
      and nullif(gj.data->>'submissionStart', '') is not null
      and nullif(gj.data->>'judgingEnd', '') is not null
      and (gj.data->>'submissionStart')::timestamptz <= now()
      and (gj.data->>'judgingEnd')::timestamptz > now()
      and exists (
        select 1
        from jsonb_array_elements(coalesce(gj.data->'submissions', '[]'::jsonb)) s
        where coalesce(s->>'listingId', '') = p_listing_id::text
          and coalesce(s->>'disqualified', 'false') is distinct from 'true'
      )
  ) then
    v_jam_free := true;
  end if;

  v_charge := case when v_jam_free then 0 else greatest(0, coalesce(v_listing.price_ducats, 0)) end;

  if v_charge <= 0 then
    insert into public.marketplace_purchases (
      user_id, listing_id, ducats_spent, creator_ducats, platform_ducats
    ) values (auth.uid(), p_listing_id, 0, 0, 0);

    update public.marketplace_listings
    set purchase_count = purchase_count + 1, updated_at = now()
    where id = p_listing_id;

    return jsonb_build_object(
      'owned', true,
      'free', true,
      'jam_free', v_jam_free,
      'bundle', v_listing.bundle,
      'balance', (select coalesce(ducat_balance, 0) from public.profiles where id = auth.uid())
    );
  end if;

  v_share := public._ducat_creator_share();
  v_creator_ducats := floor(v_charge * v_share);
  v_platform_ducats := v_charge - v_creator_ducats;

  select ducat_balance into v_balance
  from public.profiles where id = auth.uid() for update;

  if v_balance < v_charge then
    raise exception 'Not enough Ducats';
  end if;

  update public.profiles
  set ducat_balance = ducat_balance - v_charge
  where id = auth.uid()
  returning ducat_balance into v_balance;

  if v_creator_ducats > 0 then
    update public.profiles
    set creator_earned_ducats = creator_earned_ducats + v_creator_ducats
    where id = v_listing.seller_id;
  end if;

  insert into public.marketplace_purchases (
    user_id, listing_id, ducats_spent, creator_ducats, platform_ducats
  ) values (
    auth.uid(), p_listing_id, v_charge, v_creator_ducats, v_platform_ducats
  );

  update public.marketplace_listings
  set purchase_count = purchase_count + 1, updated_at = now()
  where id = p_listing_id;

  return jsonb_build_object(
    'owned', true,
    'bundle', v_listing.bundle,
    'balance', v_balance,
    'spent', v_charge
  );
end;
$$;

grant execute on function public.browse_marketplace_listings(text, text, int) to anon, authenticated;
grant execute on function public.marketplace_listing_detail(uuid) to anon, authenticated;
grant execute on function public.purchase_marketplace_listing(uuid) to authenticated;
