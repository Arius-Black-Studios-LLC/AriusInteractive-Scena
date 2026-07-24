-- Arleco Ducats — harden wallet columns against client tampering
-- Run AFTER supabase-setup.sql and supabase-wallet.sql
-- Run BEFORE supabase-stripe-wallet.sql
--
-- HOW TO RUN: Select ALL (Ctrl+A) in this file, then click Run once.

create or replace function public.profiles_protect_wallet_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if (NEW.ducat_balance is distinct from OLD.ducat_balance
        or NEW.creator_earned_ducats is distinct from OLD.creator_earned_ducats)
       and current_user in ('authenticated', 'anon') then
      raise exception 'Wallet balances are server-managed';
    end if;
  end if;
  if TG_OP = 'INSERT' then
    if (coalesce(NEW.ducat_balance, 0) <> 0 or coalesce(NEW.creator_earned_ducats, 0) <> 0)
       and current_user in ('authenticated', 'anon') then
      raise exception 'Wallet balances start at zero';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_wallet_columns on public.profiles;
create trigger profiles_protect_wallet_columns
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_wallet_columns();

create table if not exists public.ducat_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta_balance int not null default 0,
  delta_earned int not null default 0,
  reason text not null,
  ref_id text,
  created_at timestamptz not null default now()
);

create index if not exists ducat_ledger_user_idx on public.ducat_ledger (user_id, created_at desc);

alter table public.ducat_ledger enable row level security;

drop policy if exists "Users read own ducat ledger" on public.ducat_ledger;
create policy "Users read own ducat ledger"
  on public.ducat_ledger for select
  using (auth.uid() = user_id);
