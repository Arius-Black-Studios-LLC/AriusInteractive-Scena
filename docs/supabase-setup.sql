-- Arleco: minimal auth setup for Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════
-- RUN THIS FILE FIRST (before profile-fields, badges, or cloud setup).
-- Dashboard → SQL → New query → paste entire file → Run
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  username text,
  pronouns text,
  avatar_url text,
  intended_role text default 'reader',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, intended_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'intended_role', 'reader')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Optional next steps (only after this file succeeds):
--   docs/supabase-profile-fields.sql  — safe if you ran an older setup.sql without username/pronouns/avatar
--   docs/supabase-badges-setup.sql    — creator badges columns
--   docs/supabase-cloud-setup.sql     — cloud save + storage bucket
--   docs/supabase-reader-data.sql     — comments, hearts, chapter progress
