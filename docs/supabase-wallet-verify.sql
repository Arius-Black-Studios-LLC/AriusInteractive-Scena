-- Quick check after running supabase-wallet.sql (all statements succeeded)
select 'profiles.ducat_balance' as check_name,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'ducat_balance'
  ) as ok;

select 'chapter_unlocks' as check_name,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'chapter_unlocks'
  ) as ok;

select 'wallet_snapshot()' as check_name,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wallet_snapshot'
  ) as ok;

-- Should be false after stripe migration:
select 'purchase_ducat_pack removed' as check_name,
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purchase_ducat_pack'
  ) as ok;
