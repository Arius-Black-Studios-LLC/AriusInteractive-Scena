-- Ensure every signed-in auth user has a public.profiles row (fixes "Profile not found" on wallet/jam spend).
-- Run in Supabase SQL Editor after supabase-setup.sql and supabase-wallet.sql.

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

-- Backfill any auth users missing profiles (safe to re-run)
insert into public.profiles (id, email, display_name, intended_role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email, ''), '@', 1), 'Reader'),
  coalesce(u.raw_user_meta_data->>'intended_role', 'reader')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- wallet_snapshot: create profile if missing, then return balances
create or replace function public.wallet_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_creator_earned int;
  v_pending int;
  v_unlocks jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  perform public.ensure_auth_profile();

  select coalesce(ducat_balance, 0), coalesce(creator_earned_ducats, 0)
  into v_balance, v_creator_earned
  from public.profiles where id = auth.uid();

  select coalesce(sum(ducats), 0) into v_pending
  from public.cashout_requests
  where creator_id = auth.uid() and status in ('pending', 'processing');

  select coalesce(jsonb_agg(jsonb_build_object(
    'series_id', series_id, 'episode_id', episode_id
  )), '[]'::jsonb) into v_unlocks
  from public.chapter_unlocks where user_id = auth.uid();

  return jsonb_build_object(
    'balance', coalesce(v_balance, 0),
    'creator_earned', coalesce(v_creator_earned, 0),
    'pending_cashout_ducats', coalesce(v_pending, 0),
    'unlocks', v_unlocks
  );
end;
$$;

-- wallet_spend_balance: ensure profile before deducting
create or replace function public.wallet_spend_balance(
  p_amount int,
  p_reason text default 'spend',
  p_ref_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  p_amount := greatest(0, coalesce(p_amount, 0));

  perform public.ensure_auth_profile();

  if p_amount <= 0 then
    return jsonb_build_object('balance', (select ducat_balance from public.profiles where id = auth.uid()));
  end if;

  select ducat_balance into v_balance
  from public.profiles where id = auth.uid() for update;

  if v_balance is null then raise exception 'Profile not found'; end if;
  if v_balance < p_amount then raise exception 'Not enough Ducats'; end if;

  update public.profiles
  set ducat_balance = ducat_balance - p_amount
  where id = auth.uid()
  returning ducat_balance into v_balance;

  perform public._wallet_ledger_insert(auth.uid(), -p_amount, 0, coalesce(p_reason, 'spend'), p_ref_id);

  return jsonb_build_object('balance', v_balance, 'spent', p_amount);
end;
$$;

grant execute on function public.wallet_spend_balance(int, text, text) to authenticated;
