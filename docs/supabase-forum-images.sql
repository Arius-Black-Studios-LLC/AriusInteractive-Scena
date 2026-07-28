-- Arleco forum image attachments
-- Run AFTER docs/supabase-forums.sql (or supabase-fix-create-forum-topic.sql)
-- Safe to re-run.

-- ── 1. Columns ────────────────────────────────────────────────────────────────
alter table public.forum_topics
  add column if not exists image_urls text[] not null default '{}'::text[];

alter table public.forum_posts
  add column if not exists image_urls text[] not null default '{}'::text[];

alter table public.forum_topics
  drop constraint if exists forum_topics_body_or_images_check;

alter table public.forum_topics
  add constraint forum_topics_body_or_images_check check (
    char_length(trim(body)) between 1 and 8000
    or coalesce(array_length(image_urls, 1), 0) between 1 and 4
  );

alter table public.forum_posts
  drop constraint if exists forum_posts_body_or_images_check;

alter table public.forum_posts
  add constraint forum_posts_body_or_images_check check (
    char_length(trim(body)) between 1 and 8000
    or coalesce(array_length(image_urls, 1), 0) between 1 and 4
  );

alter table public.forum_topics
  drop constraint if exists forum_topics_image_urls_len_check;

alter table public.forum_topics
  add constraint forum_topics_image_urls_len_check check (
    coalesce(array_length(image_urls, 1), 0) <= 4
  );

alter table public.forum_posts
  drop constraint if exists forum_posts_image_urls_len_check;

alter table public.forum_posts
  add constraint forum_posts_image_urls_len_check check (
    coalesce(array_length(image_urls, 1), 0) <= 4
  );

-- ── 2. Helpers ────────────────────────────────────────────────────────────────
create or replace function public._forum_sanitize_image_urls(p_urls text[])
returns text[]
language plpgsql
immutable
as $$
declare
  v_out text[] := '{}'::text[];
  v_url text;
  v_count int := 0;
begin
  if p_urls is null then
    return '{}'::text[];
  end if;

  foreach v_url in array p_urls loop
    v_url := trim(coalesce(v_url, ''));
    if v_url = '' then
      continue;
    end if;
    if length(v_url) > 2048 then
      raise exception 'Image URL is too long';
    end if;
    if v_url !~* '^https?://' then
      raise exception 'Invalid image URL';
    end if;
    v_count := v_count + 1;
    if v_count > 4 then
      raise exception 'At most 4 images per post';
    end if;
    v_out := array_append(v_out, v_url);
  end loop;

  return v_out;
end;
$$;

-- ── 3. Read RPC ───────────────────────────────────────────────────────────────
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
    'image_urls', coalesce(image_urls, '{}'::text[]),
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
      image_urls,
      author,
      created_at
    from public.forum_posts
    where topic_id = p_topic_id and hidden_at is null
    order by created_at asc
  ) p;

  return v_topic || jsonb_build_object('posts', v_posts);
end;
$$;

-- ── 4. Write RPCs ─────────────────────────────────────────────────────────────
drop function if exists public.create_forum_topic(text, text, text, jsonb);

create or replace function public.create_forum_topic(
  p_title text,
  p_body text,
  p_category text default 'general',
  p_author jsonb default '{}'::jsonb,
  p_image_urls text[] default '{}'::text[]
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
  v_body text;
  v_images text[];
begin
  if auth.uid() is null then raise exception 'Sign in to start a thread'; end if;

  v_body := trim(coalesce(p_body, ''));
  v_images := public._forum_sanitize_image_urls(p_image_urls);

  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Title is too short'; end if;
  if length(v_body) < 1 and coalesce(array_length(v_images, 1), 0) < 1 then
    raise exception 'Write something or attach an image for the opening post';
  end if;

  v_cat := coalesce(nullif(trim(p_category), ''), 'general');
  if v_cat not in ('general', 'craft', 'jams', 'marketplace', 'feedback', 'help') then
    raise exception 'Invalid category';
  end if;

  if to_regprocedure('public.assert_content_allowed(text)') is not null then
    perform public.assert_content_allowed(p_title);
    if length(v_body) >= 1 then
      perform public.assert_content_allowed(v_body);
    end if;
  end if;

  v_base := public._forum_slugify(p_title);
  v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.forum_topics (
    slug, title, category, body, image_urls, author, user_id, reply_count, last_post_at
  ) values (
    v_slug,
    trim(p_title),
    v_cat,
    v_body,
    v_images,
    coalesce(p_author, '{}'::jsonb),
    auth.uid(),
    0,
    now()
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

drop function if exists public.create_forum_post(uuid, text, uuid, jsonb);

create or replace function public.create_forum_post(
  p_topic_id uuid,
  p_body text,
  p_parent_id uuid default null,
  p_author jsonb default '{}'::jsonb,
  p_image_urls text[] default '{}'::text[]
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
  v_body text;
  v_images text[];
begin
  if auth.uid() is null then raise exception 'Sign in to reply'; end if;

  v_body := trim(coalesce(p_body, ''));
  v_images := public._forum_sanitize_image_urls(p_image_urls);

  if length(v_body) < 1 and coalesce(array_length(v_images, 1), 0) < 1 then
    raise exception 'Reply is empty';
  end if;

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

  if to_regprocedure('public.assert_content_allowed(text)') is not null and length(v_body) >= 1 then
    perform public.assert_content_allowed(v_body);
  end if;

  insert into public.forum_posts (
    topic_id, user_id, parent_id, body, image_urls, author
  ) values (
    p_topic_id,
    auth.uid(),
    p_parent_id,
    v_body,
    v_images,
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

revoke all on function public.get_forum_topic(uuid) from public;
grant execute on function public.get_forum_topic(uuid) to anon, authenticated;

revoke all on function public.create_forum_topic(text, text, text, jsonb, text[]) from public;
grant execute on function public.create_forum_topic(text, text, text, jsonb, text[]) to authenticated;

revoke all on function public.create_forum_post(uuid, text, uuid, jsonb, text[]) from public;
grant execute on function public.create_forum_post(uuid, text, uuid, jsonb, text[]) to authenticated;

notify pgrst, 'reload schema';
