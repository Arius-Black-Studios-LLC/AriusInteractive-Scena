-- Marketplace star ratings (1–5). Run after supabase-marketplace.sql
-- Buyers (and free acquirers) can rate; sellers cannot rate their own listings.

create table if not exists public.marketplace_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings (id) on delete cascade,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists marketplace_ratings_listing_idx
  on public.marketplace_ratings (listing_id, stars);

alter table public.marketplace_ratings enable row level security;

drop policy if exists "Anyone reads marketplace ratings" on public.marketplace_ratings;
create policy "Anyone reads marketplace ratings"
  on public.marketplace_ratings for select
  using (true);

drop policy if exists "Users manage own marketplace ratings" on public.marketplace_ratings;
create policy "Users manage own marketplace ratings"
  on public.marketplace_ratings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.rate_marketplace_listing(
  p_listing_id uuid,
  p_stars int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_owned boolean := false;
  v_avg numeric;
  v_count int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  p_stars := greatest(1, least(5, coalesce(p_stars, 0)));

  select id, seller_id, status into v_listing
  from public.marketplace_listings
  where id = p_listing_id;

  if not found then raise exception 'Listing not found'; end if;
  if v_listing.status is distinct from 'live' then raise exception 'Listing is not live'; end if;
  if v_listing.seller_id = auth.uid() then raise exception 'You cannot rate your own listing'; end if;

  select exists (
    select 1 from public.marketplace_purchases
    where user_id = auth.uid() and listing_id = p_listing_id
  ) into v_owned;

  if not v_owned then
    raise exception 'Get this asset first, then you can rate it';
  end if;

  insert into public.marketplace_ratings (user_id, listing_id, stars, updated_at)
  values (auth.uid(), p_listing_id, p_stars, now())
  on conflict (user_id, listing_id) do update
    set stars = excluded.stars,
        updated_at = now();

  select coalesce(avg(stars)::numeric, 0), count(*)::int
    into v_avg, v_count
  from public.marketplace_ratings
  where listing_id = p_listing_id;

  return jsonb_build_object(
    'listing_id', p_listing_id,
    'my_rating', p_stars,
    'rating_avg', round(v_avg, 2),
    'rating_count', v_count
  );
end;
$$;

grant execute on function public.rate_marketplace_listing(uuid, int) to authenticated;

-- Refresh browse + detail to include rating aggregates

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
    'rating_avg', v_avg,
    'rating_count', v_count,
    'my_rating', v_mine
  );
end;
$$;
