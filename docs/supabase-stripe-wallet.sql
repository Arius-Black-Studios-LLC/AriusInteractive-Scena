-- Arleco — Stripe-backed Ducat purchases (run after supabase-wallet.sql + supabase-wallet-security.sql)
-- Removes free pack grants from browsers. Ducats credit ONLY after Stripe webhook confirms payment.

create table if not exists public.stripe_ducat_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_id text not null,
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  amount_cents int not null check (amount_cents > 0),
  ducats_granted int not null check (ducats_granted > 0),
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index if not exists stripe_ducat_payments_user_idx
  on public.stripe_ducat_payments (user_id, created_at desc);

alter table public.stripe_ducat_payments enable row level security;

drop policy if exists "Users read own stripe ducat payments" on public.stripe_ducat_payments;
create policy "Users read own stripe ducat payments"
  on public.stripe_ducat_payments for select
  using (auth.uid() = user_id);

-- Internal ledger write helper (service / security definer only)
create or replace function public._wallet_ledger_insert(
  p_user_id uuid,
  p_delta_balance int,
  p_delta_earned int,
  p_reason text,
  p_ref_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ducat_ledger') then
    insert into public.ducat_ledger (user_id, delta_balance, delta_earned, reason, ref_id)
    values (p_user_id, coalesce(p_delta_balance, 0), coalesce(p_delta_earned, 0), p_reason, p_ref_id);
  end if;
end;
$$;

-- Called ONLY from stripe-webhook Edge Function (service role)
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
  if p_amount_cents is null or p_amount_cents <> v_expected_cents then
    raise exception 'Payment amount mismatch';
  end if;

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

-- Spend spending-wallet Ducats (jams, etc.) — server-side only
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

-- Remove free browser grants
drop function if exists public.purchase_ducat_pack(text);

revoke all on function public.grant_ducat_pack_from_stripe(uuid, text, text, int, text) from public;
revoke all on function public.grant_ducat_pack_from_stripe(uuid, text, text, int, text) from authenticated;
grant execute on function public.grant_ducat_pack_from_stripe(uuid, text, text, int, text) to service_role;

grant execute on function public.wallet_spend_balance(int, text, text) to authenticated;
