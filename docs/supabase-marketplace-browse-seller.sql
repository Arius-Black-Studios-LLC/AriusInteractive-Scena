-- Restore seller_id / is_seller on browse_marketplace_listings so the shop
-- can mark “Yours” without a separate seller query.
-- Run AFTER docs/supabase-marketplace-jam-free.sql (or ratings browse).

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
        l.seller_id,
        l.jam_free_until,
        (l.jam_free_until is not null and l.jam_free_until > now()) as jam_free,
        case
          when l.jam_free_until is not null and l.jam_free_until > now() then 0
          else l.price_ducats
        end as effective_price_ducats,
        coalesce(p.display_name, p.username, 'Creator') as seller_name,
        (auth.uid() is not null and l.seller_id = auth.uid()) as is_seller,
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

grant execute on function public.browse_marketplace_listings(text, text, int) to anon, authenticated;
