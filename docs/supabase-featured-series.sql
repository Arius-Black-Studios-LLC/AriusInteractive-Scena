-- Arleco staff picks (Featured section on the home page)
-- Run in Supabase Dashboard → SQL Editor (postgres role — bypasses RLS).
--
-- IMPORTANT:
--   • Step 1 below is SELECT ONLY — it lists series so you can copy an id.
--   • Steps 2–3 update ONE row each (where id = '...'). They do NOT touch other series.
--   • The home page only shows series where data.featured = true (max 3 on page).
--
-- JSON fields on studio_series.data:
--   featured          boolean   must be true to appear in Staff picks
--   featuredOrder     number    1 = hero card, 2–3 = side cards
--   featuredEyebrow   string    optional label (hero defaults to "Editor's pick")

-- ── STEP 1: Browse published series (safe — read only) ───────────────────────
-- Run this first. Copy the `id` value for the series you want to feature.
select
  ss.id,
  ss.data->>'title' as title,
  coalesce((ss.data->>'featured')::boolean, false) as featured,
  ss.data->>'featuredOrder' as featured_order
from public.studio_series ss
where (ss.data->>'status') = 'published'
   or exists (
     select 1
     from jsonb_array_elements(coalesce(ss.data->'episodes', '[]'::jsonb)) ep
     where coalesce(ep->>'isLive', 'false') = 'true'
   )
order by ss.updated_at desc;

-- ── STEP 2: Feature ONE series as the hero pick ──────────────────────────────
-- Replace the placeholder below with a real id from step 1, then run ONLY this block.
/*
update public.studio_series
set data = jsonb_set(
      jsonb_set(
        jsonb_set(data, '{featured}', 'true'::jsonb, true),
        '{featuredOrder}', '1'::jsonb, true
      ),
      '{featuredEyebrow}', '"Editor''s pick"'::jsonb, true
    ),
    updated_at = now()
where id = 'paste-series-id-here';
*/

-- ── STEP 3: Optional second / third side pick (one id per run) ───────────────
/*
update public.studio_series
set data = jsonb_set(
      jsonb_set(data, '{featured}', 'true'::jsonb, true),
      '{featuredOrder}', '2'::jsonb, true
    ),
    updated_at = now()
where id = 'paste-another-series-id-here';
*/

-- ── See current staff picks only ─────────────────────────────────────────────
select id, data->>'title' as title, data->>'featuredOrder' as featured_order
from public.studio_series
where coalesce((data->>'featured')::boolean, false) = true
order by (data->>'featuredOrder')::int nulls last;

-- ── Remove ONE series from staff picks ───────────────────────────────────────
/*
update public.studio_series
set data = (data - 'featured' - 'featuredOrder' - 'featuredEyebrow'),
    updated_at = now()
where id = 'paste-series-id-here';
*/
