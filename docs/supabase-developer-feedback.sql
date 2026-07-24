-- Arleco developer feedback — studio prompts + homepage testimonials
-- Run after supabase-setup.sql

create table if not exists public.developer_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  context text not null default 'studio' check (context in ('studio', 'learn', 'publish')),
  rating int not null check (rating between 1 and 5),
  message text not null default '',
  share_on_homepage boolean not null default false,
  author_display_name text not null default 'Creator',
  created_at timestamptz not null default now()
);

create index if not exists developer_feedback_user_idx
  on public.developer_feedback (user_id, created_at desc);

create index if not exists developer_feedback_public_idx
  on public.developer_feedback (share_on_homepage, rating, created_at desc)
  where share_on_homepage = true and rating >= 4;

alter table public.developer_feedback enable row level security;

drop policy if exists "Users read own feedback" on public.developer_feedback;
create policy "Users read own feedback"
  on public.developer_feedback for select
  using (auth.uid() = user_id);

create or replace function public.submit_developer_feedback(
  p_rating int,
  p_message text default '',
  p_share_on_homepage boolean default false,
  p_context text default 'studio',
  p_author_display_name text default 'Creator'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1–5';
  end if;

  insert into public.developer_feedback (
    user_id, context, rating, message, share_on_homepage, author_display_name
  ) values (
    auth.uid(),
    coalesce(nullif(trim(p_context), ''), 'studio'),
    p_rating,
    coalesce(trim(p_message), ''),
    coalesce(p_share_on_homepage, false) and p_rating >= 4,
    coalesce(nullif(trim(p_author_display_name), ''), 'Creator')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.public_developer_reviews(p_limit int default 12)
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc)
    from (
      select
        id,
        rating,
        message,
        author_display_name,
        context,
        created_at
      from public.developer_feedback
      where share_on_homepage = true
        and rating >= 4
        and length(trim(message)) >= 8
      order by created_at desc
      limit greatest(1, least(coalesce(p_limit, 12), 24))
    ) t
  ), '[]'::jsonb);
end;
$$;

create or replace function public.developer_feedback_submitted()
returns boolean language plpgsql security definer set search_path = public stable as $$
begin
  if auth.uid() is null then return false; end if;
  return exists (
    select 1 from public.developer_feedback where user_id = auth.uid()
  );
end;
$$;

grant execute on function public.submit_developer_feedback(int, text, boolean, text, text) to authenticated;
grant execute on function public.public_developer_reviews(int) to anon, authenticated;
grant execute on function public.developer_feedback_submitted() to authenticated;
