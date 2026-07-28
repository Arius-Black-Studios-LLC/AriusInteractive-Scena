-- Arleco community forums (topic threads)
-- Run AFTER docs/supabase-setup.sql
-- Prefer also running docs/supabase-content-policy.sql first (assert_content_allowed).
-- Safe to re-run.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    raise exception 'Run docs/supabase-setup.sql first — public.profiles does not exist yet.';
  end if;
end $$;

create table if not exists public.forum_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (char_length(trim(title)) between 3 and 120),
  category text not null default 'general'
    check (category in ('general', 'craft', 'jams', 'marketplace', 'feedback', 'help')),
  body text not null check (char_length(trim(body)) between 1 and 8000),
  author jsonb not null default '{}'::jsonb,
  user_id uuid not null references auth.users (id) on delete cascade,
  pinned_at timestamptz,
  locked_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_reason text,
  reply_count int not null default 0 check (reply_count >= 0),
  last_post_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists forum_topics_list_idx
  on public.forum_topics (last_post_at desc)
  where hidden_at is null;

create index if not exists forum_topics_category_idx
  on public.forum_topics (category, last_post_at desc)
  where hidden_at is null;

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.forum_topics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.forum_posts (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 8000),
  author jsonb not null default '{}'::jsonb,
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_reason text,
  created_at timestamptz not null default now()
);

create index if not exists forum_posts_thread_idx
  on public.forum_posts (topic_id, created_at asc);

alter table public.forum_topics enable row level security;
alter table public.forum_posts enable row level security;

drop policy if exists "Anyone reads visible forum topics" on public.forum_topics;
create policy "Anyone reads visible forum topics"
  on public.forum_topics for select
  using (hidden_at is null or auth.uid() = user_id);

drop policy if exists "Anyone reads visible forum posts" on public.forum_posts;
create policy "Anyone reads visible forum posts"
  on public.forum_posts for select
  using (hidden_at is null or auth.uid() = user_id);

-- Writes go through security-definer RPCs
drop policy if exists "No direct forum topic insert" on public.forum_topics;
create policy "No direct forum topic insert"
  on public.forum_topics for insert
  to authenticated
  with check (false);

drop policy if exists "No direct forum post insert" on public.forum_posts;
create policy "No direct forum post insert"
  on public.forum_posts for insert
  to authenticated
  with check (false);

create or replace function public._forum_slugify(p_title text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(trim(coalesce(p_title, '')));
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := trim(both '-' from v);
  if length(v) < 2 then v := 'topic'; end if;
  if length(v) > 60 then v := left(v, 60); end if;
  return v;
end;
$$;

create or replace function public.list_forum_topics(
  p_category text default null,
  p_limit int default 40,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb)
    from (
      select
        id,
        slug,
        title,
        category,
        left(body, 280) as excerpt,
        author,
        user_id,
        reply_count,
        last_post_at,
        created_at,
        pinned_at is not null as pinned,
        locked_at is not null as locked
      from public.forum_topics
      where hidden_at is null
        and (
          p_category is null or p_category = '' or p_category = 'all'
          or category = p_category
        )
      order by pinned_at desc nulls last, last_post_at desc
      limit greatest(1, least(coalesce(p_limit, 40), 100))
      offset greatest(0, coalesce(p_offset, 0))
    ) t
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_forum_topic(p_topic_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_topic jsonb;
  v_posts jsonb;
begin
  select jsonb_build_object(
    'id', id,
    'slug', slug,
    'title', title,
    'category', category,
    'body', body,
    'author', author,
    'user_id', user_id,
    'reply_count', reply_count,
    'last_post_at', last_post_at,
    'created_at', created_at,
    'pinned', pinned_at is not null,
    'locked', locked_at is not null
  )
  into v_topic
  from public.forum_topics
  where id = p_topic_id and hidden_at is null;

  if v_topic is null then
    return null;
  end if;

  select coalesce(jsonb_agg(row_to_json(p)::jsonb order by p.created_at asc), '[]'::jsonb)
  into v_posts
  from (
    select
      id,
      topic_id,
      user_id,
      parent_id,
      body,
      author,
      created_at
    from public.forum_posts
    where topic_id = p_topic_id and hidden_at is null
    order by created_at asc
  ) p;

  return v_topic || jsonb_build_object('posts', v_posts);
end;
$$;

create or replace function public.create_forum_topic(
  p_title text,
  p_body text,
  p_category text default 'general',
  p_author jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
  v_base text;
  v_cat text;
begin
  if auth.uid() is null then raise exception 'Sign in to start a thread'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Title is too short'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Write something for the opening post'; end if;

  v_cat := coalesce(nullif(trim(p_category), ''), 'general');
  if v_cat not in ('general', 'craft', 'jams', 'marketplace', 'feedback', 'help') then
    raise exception 'Invalid category';
  end if;

  if to_regprocedure('public.assert_content_allowed(text)') is not null then
    perform public.assert_content_allowed(p_title);
    perform public.assert_content_allowed(p_body);
  end if;

  v_base := public._forum_slugify(p_title);
  v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.forum_topics (
    slug, title, category, body, author, user_id, reply_count, last_post_at
  ) values (
    v_slug,
    trim(p_title),
    v_cat,
    trim(p_body),
    coalesce(p_author, '{}'::jsonb),
    auth.uid(),
    0,
    now()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

create or replace function public.create_forum_post(
  p_topic_id uuid,
  p_body text,
  p_parent_id uuid default null,
  p_author jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_locked timestamptz;
  v_hidden timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to reply'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'Reply is empty'; end if;

  select locked_at, hidden_at into v_locked, v_hidden
  from public.forum_topics
  where id = p_topic_id;

  if not found then raise exception 'Thread not found'; end if;
  if v_hidden is not null then raise exception 'Thread is unavailable'; end if;
  if v_locked is not null then raise exception 'This thread is locked'; end if;

  if p_parent_id is not null and not exists (
    select 1 from public.forum_posts
    where id = p_parent_id and topic_id = p_topic_id and hidden_at is null
  ) then
    raise exception 'Parent reply not found';
  end if;

  if to_regprocedure('public.assert_content_allowed(text)') is not null then
    perform public.assert_content_allowed(p_body);
  end if;

  insert into public.forum_posts (
    topic_id, user_id, parent_id, body, author
  ) values (
    p_topic_id,
    auth.uid(),
    p_parent_id,
    trim(p_body),
    coalesce(p_author, '{}'::jsonb)
  )
  returning id into v_id;

  update public.forum_topics
  set reply_count = reply_count + 1,
      last_post_at = now()
  where id = p_topic_id;

  return v_id;
end;
$$;

revoke all on function public.list_forum_topics(text, int, int) from public;
grant execute on function public.list_forum_topics(text, int, int) to anon, authenticated;

revoke all on function public.get_forum_topic(uuid) from public;
grant execute on function public.get_forum_topic(uuid) to anon, authenticated;

revoke all on function public.create_forum_topic(text, text, text, jsonb) from public;
grant execute on function public.create_forum_topic(text, text, text, jsonb) to authenticated;

revoke all on function public.create_forum_post(uuid, text, uuid, jsonb) from public;
grant execute on function public.create_forum_post(uuid, text, uuid, jsonb) to authenticated;
