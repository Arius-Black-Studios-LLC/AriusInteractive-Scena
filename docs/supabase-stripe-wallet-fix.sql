-- Fix Ducat grants after Stripe payment (webhook or return-path confirm)
-- Run in Supabase SQL Editor if purchases charge card but balance stays 0.

create or replace function public.grant_ducat_pack_from_stripe(
  p_user_id uuid,
  p_pack_id text,
  p_stripe_session_id text,
  p_amount_cents int,
  p_stripe_payment_intent_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ducats int;
  v_expected_cents int;
  v_balance int;
  v_existing uuid;
begin
  if p_user_id is null then raise exception 'Missing user'; end if;
  if p_stripe_session_id is null or length(trim(p_stripe_session_id)) = 0 then
    raise exception 'Missing Stripe session id';
  end if;

  select id into v_existing
  from public.stripe_ducat_payments
  where stripe_session_id = p_stripe_session_id
  limit 1;

  if v_existing is not null then
    select ducat_balance into v_balance from public.profiles where id = p_user_id;
    return jsonb_build_object('balance', coalesce(v_balance, 0), 'already', true);
  end if;

  v_ducats := public._ducat_pack_amount(p_pack_id);
  v_expected_cents := public._ducat_pack_price_cents(p_pack_id);

  if v_ducats is null or v_expected_cents is null then
    raise exception 'Unknown Ducat pack';
  end if;
  -- Managed Payments may add tax — paid total can exceed pack price, never less
  if p_amount_cents is null or p_amount_cents < v_expected_cents then
    raise exception 'Payment amount mismatch';
  end if;

  -- Ensure profile row exists (webhook has no auth.uid())
  insert into public.profiles (id, email, display_name, intended_role)
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'display_name', split_part(coalesce(u.email, ''), '@', 1), 'Reader'),
    coalesce(u.raw_user_meta_data->>'intended_role', 'reader')
  from auth.users u
  where u.id = p_user_id
  on conflict (id) do nothing;

  update public.profiles
  set ducat_balance = ducat_balance + v_ducats
  where id = p_user_id
  returning ducat_balance into v_balance;

  if v_balance is null then raise exception 'Profile not found'; end if;

  insert into public.stripe_ducat_payments (
    user_id, pack_id, stripe_session_id, stripe_payment_intent_id,
    amount_cents, ducats_granted, status, fulfilled_at
  ) values (
    p_user_id, p_pack_id, p_stripe_session_id, p_stripe_payment_intent_id,
    p_amount_cents, v_ducats, 'completed', now()
  );

  perform public._wallet_ledger_insert(
    p_user_id, v_ducats, 0, 'stripe_purchase', p_stripe_session_id
  );

  return jsonb_build_object(
    'balance', v_balance,
    'ducats_granted', v_ducats,
    'pack_id', p_pack_id
  );
end;
$$;

notify pgrst, 'reload schema';

-- Manual recovery (if you were charged but balance is still 0):
-- 1. Stripe Dashboard → Payments → open the charge → copy Checkout session id (cs_live_...)
-- 2. Supabase → Authentication → Users → copy your user UUID
-- 3. Replace placeholders and run once:

-- select public.grant_ducat_pack_from_stripe(
--   'YOUR_USER_UUID'::uuid,
--   'ducat_10',               -- pack id: ducat_10 | ducat_55 | ducat_120 | ducat_500
--   'cs_live_XXXX',           -- Stripe checkout session id
--   99,                       -- amount_total from Stripe (cents; can include tax)
--   'pi_XXXX'                 -- payment intent id (optional)
-- );
