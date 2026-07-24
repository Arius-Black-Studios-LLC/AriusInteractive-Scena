# Arleco React rewrite (`react-rewrite` branch)

Production on **`main`** still serves static **`docs/`**. This branch runs the new **`web/`** app (Vite + React + TypeScript) with **legacy JS bridged unchanged** so user data stays compatible.

## User data preserved

| Storage | Key / name | Notes |
|---------|------------|--------|
| Supabase auth | `sb-*-auth-token` in localStorage | Same project + anon key |
| Post-login redirect | `scena_post_login` in sessionStorage | Studio / account flows |
| Reader progress | `scena.progress.{scopeId}.{seriesId}` | Per save file |
| Creator projects | IndexedDB `scena_studio_db` / `studio_v1` | Graph + episodes |

Do **not** rename these keys or change the Supabase project during cutover.

## Local preview

```powershell
cd web
copy .env.example .env
# Same VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY as docs/scena-config.js
npm install
npm run dev
```

Open `http://localhost:5173`

Build check:

```powershell
npm run build
```

## What’s implemented

| Route | Status |
|-------|--------|
| `/` | Hero, featured, discover, creator reviews |
| `/series` | Chapters, save files, unlock rules |
| `/play` | Full legacy player |
| `/studio` | Legacy graph editor + marketplace |
| `/account` | Profile, wallet UI via legacy |
| `/learn` | Conservatory lessons |
| `/blog` | React index; articles at `/blog/*.html` |
| `/help`, `/about`, `/contact`, … | Static content pages |

Legacy scripts are copied from **`docs/`** into **`web/public/legacy/`** on dev/build (Vite plugin). Blog article CSS paths are rewritten to `/legacy/…`.

## Netlify (branch deploy)

`netlify.toml` on this branch:

```toml
[build]
  base = "web"
  command = "npm ci && npm run build"
  publish = "web/dist"
```

Set env vars (same as legacy):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_REDIRECT_URL` → preview URL or `https://arleco.app/` after cutover

Use a **deploy preview** on `react-rewrite` before merging to `main`.

## Cutover checklist

1. Merge `react-rewrite` → `main`
2. Add production redirect URL in Supabase Auth settings
3. Smoke-test: login, read, save files, studio publish, marketplace, learn
4. Keep `docs/` as legacy source until fully retired
