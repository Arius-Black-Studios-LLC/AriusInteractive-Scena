-- Jam prize pool payout (run after supabase-stripe-wallet.sql)
-- Escrow: wallet_spend_balance with reason 'jam_prize' and ref_id = jam id
-- Release: host calls jam_payout_winner after judging

create or replace function public.jam_payout_winner(
  p_jam_id text,
  p_winner_user_id uuid,
  p_amount int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_pool int;
  v_paid int;
  v_remaining int;
  v_balance int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_jam_id is null or length(trim(p_jam_id)) = 0 then raise exception 'Missing jam id'; end if;
  if p_winner_user_id is null then raise exception 'Missing winner'; end if;
  p_amount := greatest(0, coalesce(p_amount, 0));
  if p_amount <= 0 then raise exception 'Invalid payout amount'; end if;

  select user_id into v_host
  from public.ducat_ledger
  where ref_id = p_jam_id and reason = 'jam_prize' and delta_balance < 0
  order by created_at asc
  limit 1;

  if v_host is null then raise exception 'No prize pool for this jam'; end if;
  if auth.uid() is distinct from v_host then raise exception 'Only the jam host can release prizes'; end if;

  select coalesce(sum(-delta_balance), 0) into v_pool
  from public.ducat_ledger
  where ref_id = p_jam_id and reason = 'jam_prize' and delta_balance < 0;

  select coalesce(sum(delta_balance), 0) into v_paid
  from public.ducat_ledger
  where ref_id = p_jam_id and reason = 'jam_prize_win' and delta_balance > 0;

  v_remaining := v_pool - v_paid;
  if p_amount > v_remaining then
    raise exception 'Prize pool only has % Ducats left', v_remaining;
  end if;

  update public.profiles
  set ducat_balance = ducat_balance + p_amount
  where id = p_winner_user_id
  returning ducat_balance into v_balance;

  if v_balance is null then raise exception 'Winner profile not found'; end if;

  perform public._wallet_ledger_insert(
    p_winner_user_id, p_amount, 0, 'jam_prize_win', p_jam_id
  );

  return jsonb_build_object(
    'winner_balance', v_balance,
    'paid', p_amount,
    'remaining', v_remaining - p_amount
  );
end;
$$;

grant execute on function public.jam_payout_winner(text, uuid, int) to authenticated;
