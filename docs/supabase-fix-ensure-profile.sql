-- ONE-CLICK FIX: "Could not find ensure_auth_profile in the schema cache"
-- Run in Supabase SQL Editor (correct project — match Netlify SCENA_SUPABASE_URL).
-- Safe to re-run.

create or replace function public.ensure_auth_profile()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  insert into public.profiles (id, email, display_name, intended_role)
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email, ''), '@', 1), 'Reader'),
    coalesce(u.raw_user_meta_data->>'intended_role', 'reader')
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;

  return v_uid;
end;
$$;

grant execute on function public.ensure_auth_profile() to authenticated;

insert into public.profiles (id, email, display_name, intended_role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email, ''), '@', 1), 'Reader'),
  coalesce(u.raw_user_meta_data->>'intended_role', 'reader')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

notify pgrst, 'reload schema';

-- Verify (should return 1 row):
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and proname = 'ensure_auth_profile';
