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

-- Empty jam (no eligible entries): refund each contributor what they put in.
-- Uses ducat_ledger rows already written on contribute — no extra per-donor table.
-- Prevents host fraud of disqualifying everyone and keeping the pot.
create or replace function public.jam_refund_empty_prize_pool(p_jam_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_entries int := 0;
  v_has_jam boolean := false;
  v_row record;
  v_refunded int := 0;
  v_refunds jsonb := '[]'::jsonb;
  v_already int;
  v_pay int;
  v_balance int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_jam_id is null or length(trim(p_jam_id)) = 0 then raise exception 'Missing jam id'; end if;

  if to_regclass('public.game_jams') is not null then
    select
      gj.host_user_id,
      coalesce((
        select count(*)::int
        from jsonb_array_elements(coalesce(gj.data->'submissions', '[]'::jsonb)) s
        where coalesce(s->>'disqualified', 'false') is distinct from 'true'
      ), 0)
    into v_host, v_entries
    from public.game_jams gj
    where gj.id = p_jam_id;

    v_has_jam := found;
  end if;

  if not v_has_jam or v_host is null then
    -- Fall back: earliest jam_prize spender is treated as host for auth only
    select user_id into v_host
    from public.ducat_ledger
    where ref_id = p_jam_id and reason = 'jam_prize' and delta_balance < 0
    order by created_at asc
    limit 1;
  end if;

  if v_host is null then raise exception 'No prize pool for this jam'; end if;

  -- Anyone may trigger an empty-pool refund; money only returns to original contributors.
  if v_has_jam and v_entries > 0 then
    raise exception 'This jam still has eligible entries — prize pool cannot be refunded';
  end if;

  -- Also block if winners were already paid from this pool
  if exists (
    select 1 from public.ducat_ledger
    where ref_id = p_jam_id and reason = 'jam_prize_win' and delta_balance > 0
  ) then
    raise exception 'Prize payouts already started — cannot refund this pool';
  end if;

  for v_row in
    select user_id, coalesce(sum(-delta_balance), 0)::int as contributed
    from public.ducat_ledger
    where ref_id = p_jam_id and reason = 'jam_prize' and delta_balance < 0
    group by user_id
  loop
    select coalesce(sum(delta_balance), 0)::int into v_already
    from public.ducat_ledger
    where ref_id = p_jam_id
      and user_id = v_row.user_id
      and reason = 'jam_prize_refund'
      and delta_balance > 0;

    v_pay := greatest(0, v_row.contributed - v_already);
    if v_pay <= 0 then
      continue;
    end if;

    update public.profiles
    set ducat_balance = ducat_balance + v_pay
    where id = v_row.user_id
    returning ducat_balance into v_balance;

    if v_balance is null then
      raise exception 'Contributor profile not found';
    end if;

    perform public._wallet_ledger_insert(
      v_row.user_id, v_pay, 0, 'jam_prize_refund', p_jam_id
    );

    v_refunded := v_refunded + v_pay;
    v_refunds := v_refunds || jsonb_build_array(jsonb_build_object(
      'user_id', v_row.user_id,
      'amount', v_pay,
      'is_host', v_row.user_id = v_host
    ));
  end loop;

  return jsonb_build_object(
    'refunded', v_refunded,
    'refunds', v_refunds,
    'host_user_id', v_host
  );
end;
$$;

revoke all on function public.jam_refund_empty_prize_pool(text) from public;
grant execute on function public.jam_refund_empty_prize_pool(text) to authenticated;

-- Back-compat alias (old name); now refunds each contributor, not the whole pot to the host.
create or replace function public.jam_refund_prize_to_host(p_jam_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.jam_refund_empty_prize_pool(p_jam_id);
end;
$$;

revoke all on function public.jam_refund_prize_to_host(text) from public;
grant execute on function public.jam_refund_prize_to_host(text) to authenticated;
