-- Arleco automatic UGC text filter (comments, listings, series, jams, profile names)
-- Run AFTER supabase-reader-data.sql, supabase-marketplace.sql, and supabase-admin-moderation.sql (game_jams)
--
-- Rejects posts that match blocked terms (profanity / slurs). Keep in sync with docs/scena-content-policy.js

create or replace function public.normalize_content_text(p_text text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                lower(coalesce(p_text, '')),
                '[@4]', 'a', 'g'
              ),
              '[3]', 'e', 'g'
            ),
            '[1!|]', 'i', 'g'
          ),
          '[0]', 'o', 'g'
        ),
        '[$5]', 's', 'g'
      ),
      '[7+]', 't', 'g'
    ),
    '[^a-z0-9\s]', ' ', 'g'
  ));
$$;

create or replace function public.content_policy_blocked_terms()
returns text[]
language sql
immutable
as $$
  select array[
    'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'shitty', 'bullshit',
    'bitch', 'bastard', 'cunt', 'dick', 'pussy', 'whore', 'slut',
    'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded',
    'kike', 'spic', 'chink', 'wetback'
  ]::text[];
$$;

create or replace function public.content_policy_violation(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  norm text;
  term text;
begin
  norm := public.normalize_content_text(p_text);
  if norm = '' then
    return null;
  end if;
  foreach term in array public.content_policy_blocked_terms() loop
    if norm ~ ('(^|\s)' || regexp_replace(term, '([.*+?^${}()|[\]\\])', '\\\1', 'g') || '(\s|$)') then
      return term;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.assert_content_allowed(p_text text)
returns void
language plpgsql
as $$
begin
  if public.content_policy_violation(p_text) is not null then
    raise exception 'Content blocked: remove prohibited language before posting.';
  end if;
end;
$$;

revoke all on function public.assert_content_allowed(text) from public;
grant execute on function public.assert_content_allowed(text) to authenticated;

create or replace function public.post_episode_comment(
  p_series_id text,
  p_episode_id text,
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
begin
  if auth.uid() is null then
    raise exception 'Sign in to comment';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Comment is empty';
  end if;

  perform public.assert_content_allowed(p_body);

  insert into public.episode_comments (
    series_id, episode_id, user_id, parent_id, body, author
  ) values (
    p_series_id,
    p_episode_id,
    auth.uid(),
    p_parent_id,
    trim(p_body),
    coalesce(p_author, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.post_episode_comment(text, text, text, uuid, jsonb) from public;
grant execute on function public.post_episode_comment(text, text, text, uuid, jsonb) to authenticated;

create or replace function public.episode_comments_enforce_policy()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_content_allowed(NEW.body);
  return NEW;
end;
$$;

drop trigger if exists episode_comments_enforce_policy on public.episode_comments;
create trigger episode_comments_enforce_policy
  before insert or update of body on public.episode_comments
  for each row execute function public.episode_comments_enforce_policy();

create or replace function public.marketplace_listings_enforce_policy()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_content_allowed(NEW.title);
  perform public.assert_content_allowed(NEW.description);
  return NEW;
end;
$$;

drop trigger if exists marketplace_listings_enforce_policy on public.marketplace_listings;
create trigger marketplace_listings_enforce_policy
  before insert or update of title, description on public.marketplace_listings
  for each row execute function public.marketplace_listings_enforce_policy();

create or replace function public.publish_marketplace_listing(
  p_title text,
  p_description text,
  p_category text,
  p_price_ducats int,
  p_bundle jsonb,
  p_preview_data_url text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_title is null or length(trim(p_title)) < 2 then raise exception 'Title too short'; end if;
  if p_category not in ('character', 'stage', 'item', 'audio', 'pack') then
    raise exception 'Invalid category';
  end if;
  if p_price_ducats is null or p_price_ducats < 0 then raise exception 'Invalid price'; end if;
  if p_bundle is null or p_bundle = '{}'::jsonb then raise exception 'Bundle is empty'; end if;

  perform public.assert_content_allowed(p_title);
  perform public.assert_content_allowed(coalesce(p_description, ''));

  insert into public.marketplace_listings (
    seller_id, title, description, category, price_ducats, bundle, preview_data_url, status
  ) values (
    auth.uid(),
    trim(p_title),
    coalesce(trim(p_description), ''),
    p_category,
    p_price_ducats,
    p_bundle,
    p_preview_data_url,
    'live'
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.studio_series_enforce_policy()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_content_allowed(coalesce(NEW.data->>'shortDescription', ''));
  perform public.assert_content_allowed(coalesce(NEW.data->>'longDescription', ''));
  return NEW;
end;
$$;

drop trigger if exists studio_series_enforce_policy on public.studio_series;
create trigger studio_series_enforce_policy
  before insert or update of data on public.studio_series
  for each row execute function public.studio_series_enforce_policy();

create or replace function public.profiles_enforce_policy()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_content_allowed(coalesce(NEW.display_name, ''));
  return NEW;
end;
$$;

drop trigger if exists profiles_enforce_policy on public.profiles;
create trigger profiles_enforce_policy
  before insert or update of display_name on public.profiles
  for each row execute function public.profiles_enforce_policy();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'game_jams'
  ) then
    execute $sql$
      create or replace function public.game_jams_enforce_policy()
      returns trigger
      language plpgsql
      as $fn$
      begin
        perform public.assert_content_allowed(coalesce(NEW.data->>'tagline', ''));
        perform public.assert_content_allowed(coalesce(NEW.data->>'rules', ''));
        return NEW;
      end;
      $fn$;

      drop trigger if exists game_jams_enforce_policy on public.game_jams;
      create trigger game_jams_enforce_policy
        before insert or update of data on public.game_jams
        for each row execute function public.game_jams_enforce_policy();
    $sql$;
  end if;
end $$;
