-- Arleco Ducats — reader wallet, creator earnings, cash-out
-- Run in Supabase SQL Editor after supabase-setup.sql
--
-- HOW TO RUN (important):
--   1. Open this entire file in the SQL editor
--   2. Select ALL (Ctrl+A) — do NOT run a highlighted selection only
--   3. Click Run once
--   Or run part A then part B below (both required).
--
-- Economics (must match scena-wallet.js / MONETIZATION.md):--   CREATOR_SHARE = 70% of spent Ducats → creator_earned_ducats
--   REFERENCE_RETAIL = $0.04 per Ducat ($20 / 500 face value)
--   CASHOUT = 70% of reference → $0.028 per earned Ducat ($14 / 500)
--   MIN_CASHOUT = 500 earned Ducats ($14)
-- Beta: Ducat purchases require Stripe — see supabase-stripe-wallet.sql (no free purchase_ducat_pack).

-- ========== PART A: tables + RLS (run through here if splitting) ==========

alter table public.profiles
  add column if not exists ducat_balance int not null default 0 check (ducat_balance >= 0);

alter table public.profiles
  add column if not exists creator_earned_ducats int not null default 0 check (creator_earned_ducats >= 0);

create table if not exists public.chapter_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  series_id text not null,
  episode_id text not null,
  creator_id uuid references auth.users (id) on delete set null,
  ducats_spent int not null default 0 check (ducats_spent >= 0),
  creator_ducats int not null default 0 check (creator_ducats >= 0),
  platform_ducats int not null default 0 check (platform_ducats >= 0),
  unlocked_at timestamptz not null default now(),
  unique (user_id, series_id, episode_id)
);

create index if not exists chapter_unlocks_user_idx on public.chapter_unlocks (user_id);
create index if not exists chapter_unlocks_creator_idx on public.chapter_unlocks (creator_id);

create table if not exists public.creator_earnings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  reader_id uuid not null references auth.users (id) on delete cascade,
  series_id text not null,
  episode_id text not null,
  ducats_spent int not null check (ducats_spent > 0),
  creator_ducats int not null check (creator_ducats >= 0),
  platform_ducats int not null check (platform_ducats >= 0),
  created_at timestamptz not null default now()
);

create index if not exists creator_earnings_creator_idx on public.creator_earnings (creator_id, created_at desc);

create table if not exists public.cashout_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  ducats int not null check (ducats > 0),
  usd_cents int not null check (usd_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'rejected')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists cashout_requests_creator_idx on public.cashout_requests (creator_id, requested_at desc);

alter table public.chapter_unlocks enable row level security;
alter table public.creator_earnings enable row level security;
alter table public.cashout_requests enable row level security;

drop policy if exists "Users read own chapter unlocks" on public.chapter_unlocks;
create policy "Users read own chapter unlocks"
  on public.chapter_unlocks for select
  using (auth.uid() = user_id);

drop policy if exists "Creators read earnings on their work" on public.creator_earnings;
create policy "Creators read earnings on their work"
  on public.creator_earnings for select
  using (auth.uid() = creator_id);

drop policy if exists "Creators read own cashout requests" on public.cashout_requests;
create policy "Creators read own cashout requests"
  on public.cashout_requests for select
  using (auth.uid() = creator_id);

-- ========== PART B: functions + grants (run after part A succeeds) ==========

-- Constantscreate or replace function public._ducat_creator_share()
returns numeric language sql immutable as $$ select 0.70; $$;

create or replace function public._ducat_reference_retail_cents()
returns int language sql immutable as $$ select 4; $$;

create or replace function public._ducat_cashout_ratio()
returns numeric language sql immutable as $$ select 0.70; $$;

create or replace function public._ducat_cashout_cents(p_ducats int)
returns int language sql immutable as $$
  select floor(greatest(p_ducats, 0) * public._ducat_reference_retail_cents() * public._ducat_cashout_ratio())::int;
$$;

create or replace function public._ducat_min_cashout()
returns int language sql immutable as $$ select 500; $$;

create or replace function public._ducat_pack_amount(p_pack_id text)
returns int language sql immutable as $$
  select case p_pack_id
    when 'ducat_10' then 10
    when 'ducat_55' then 55
    when 'ducat_120' then 120
    when 'ducat_500' then 500
    else null
  end;
$$;

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

create or replace function public._resolve_series_creator(p_series_id text, p_creator_id uuid)
returns uuid language plpgsql stable as $$
declare
  v_creator uuid;
begin
  if p_creator_id is not null then
    return p_creator_id;
  end if;
  select user_id into v_creator
  from public.studio_series
  where id = p_series_id
  order by updated_at desc
  limit 1;
  return v_creator;
end;
$$;

create or replace function public.wallet_snapshot()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_balance int;
  v_creator_earned int;
  v_pending int;
  v_unlocks jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

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

-- purchase_ducat_pack removed — use Stripe webhook → grant_ducat_pack_from_stripe (supabase-stripe-wallet.sql)

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

  insert into public.chapter_unlocks (
    user_id, series_id, episode_id, creator_id,
    ducats_spent, creator_ducats, platform_ducats
  ) values (
    auth.uid(), p_series_id, p_episode_id, v_creator,
    p_cost, v_creator_ducats, v_platform_ducats
  );

  return jsonb_build_object(
    'balance', v_balance,
    'creator_credited', v_creator_ducats
  );
end;
$$;

create or replace function public.request_creator_cashout(p_ducats int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_earned int;
  v_usd_cents int;
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_ducats is null or p_ducats < public._ducat_min_cashout() then
    raise exception 'Minimum cash-out not met';
  end if;

  select creator_earned_ducats into v_earned
  from public.profiles where id = auth.uid() for update;

  if v_earned is null or v_earned < p_ducats then
    raise exception 'Not enough earned Ducats';
  end if;

  v_usd_cents := public._ducat_cashout_cents(p_ducats);

  update public.profiles
  set creator_earned_ducats = creator_earned_ducats - p_ducats
  where id = auth.uid();

  insert into public.cashout_requests (creator_id, ducats, usd_cents, status)
  values (auth.uid(), p_ducats, v_usd_cents, 'pending')
  returning id into v_request_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'ducats', p_ducats,
    'usd_cents', v_usd_cents,
    'status', 'pending'
  );
end;
$$;

grant execute on function public.wallet_snapshot() to authenticated;
grant execute on function public.unlock_chapter_with_ducats(text, text, int, uuid) to authenticated;
grant execute on function public.request_creator_cashout(int) to authenticated;
