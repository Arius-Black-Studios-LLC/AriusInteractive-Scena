-- Run after fixing Stripe webhook URL (see below).
-- Lowers starter pack to Stripe's $0.50 USD minimum for cheap live testing.

create or replace function public._ducat_pack_price_cents(p_pack_id text)
returns int language sql immutable as $$
  select case p_pack_id
    when 'ducat_10' then 99
    when 'ducat_55' then 499
    when 'ducat_120' then 999
    when 'ducat_500' then 2499
    else null
  end;
$$;

-- Ensure every signed-in user has a profile row (empty profiles = balance query returns nothing)
insert into public.profiles (id, email, display_name, intended_role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email, ''), '@', 1), 'Reader'),
  coalesce(u.raw_user_meta_data->>'intended_role', 'reader')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

notify pgrst, 'reload schema';
