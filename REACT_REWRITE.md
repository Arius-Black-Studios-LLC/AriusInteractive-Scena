# Arleco React rewrite (`react-rewrite` branch)

Production on **`main`** still serves static **`docs/`**. This branch runs **`web/`** (Vite + React + TypeScript) with legacy JS **bridged** for user data compatibility.

## Architecture (honest answer)

This is **not** a full React rewrite of domain logic yet. It is a **hybrid shell**:

| Layer | Owns |
|-------|------|
| **React (`web/src/`)** | Routing, site chrome, home/discover UI, Conservatory catalog, static pages, auth modal |
| **Legacy (`docs/*.js`)** | Player, studio graph, lesson validators, graph sandbox, saves, marketplace, Supabase auth |
| **Bridge (`web/src/legacy/`)** | Ports, adapters, script bundles, config loader |

### Conservatory (React catalog + legacy graph)

| Layer | Path | Responsibility |
|-------|------|----------------|
| Domain | `domain/learn/types.ts` | Pure types — no legacy imports |
| Ports | `legacy/ports/BadgePort.ts`, `LearnPort.ts` | Interfaces React depends on (DIP) |
| Adapters | `legacy/adapters/badgeAdapter.ts`, `learnAdapter.ts` | Wrap `window.Scena*` |
| UI | `components/learn/*` | Catalog, cards, progress, lesson shell |
| Routes | `/learn`, `/learn/:lessonId` | React Router (replaces hash + `learn-app.js`) |
| Graph widget | `docs/studio-graph.js` via `learn-sandbox.js` | Embedded editor — not React yet |

The graph editor **looks the same** because it **is** the same editor — only the catalog, routing, and lesson chrome moved to React.

### SOLID progress

| Principle | Example |
|-----------|---------|
| **S** | `LearnCatalog`, `LearnLessonRunner`, `LearnBadgePanel` — one job each |
| **O** | New catalog UI = new component; graph extends via legacy `validate()` |
| **I** | Separate `BadgePort` and `LearnPort` |
| **D** | Hooks/components → ports → adapters → legacy |

### Studio (React shell + legacy workspace)

| Layer | Path | Responsibility |
|-------|------|----------------|
| Port | `legacy/ports/StudioPort.ts` | `boot`, `navigate`, `toast` |
| Adapter | `legacy/adapters/studioAdapter.ts` | Wraps `ScenaStudio` |
| Context | `context/StudioContext.tsx` | Auth gate, bundle load, boot |
| UI | `components/studio/*`, `pages/studio/StudioLayout.tsx` | Topbar, modals, mount points |
| Workspace | `docs/studio-app.js` | Dashboard, graph, episodes (hash routes) |

### Lesson data (`domain/learn/lessonCatalog.ts`)

All 18 Conservatory lessons — id, title, category, order, mode, summary — live in TypeScript. Legacy `learn-lessons.js` still provides `setup`, `validate`, and `instructions`.

### Next migration slices

1. Extract lesson **instructions** to TS or MD
2. React Router paths for studio (`/studio/series/:id/graph`) instead of hash
3. **Graph editor** last — legacy widget behind `GraphEditorPort`

## User data preserved

| Storage | Key / name |
|---------|------------|
| Supabase auth | `sb-*-auth-token` |
| Post-login | `scena_post_login` |
| Reader progress | `scena.progress.{scopeId}.{seriesId}` |
| Creator projects | IndexedDB `scena_studio_db` / `studio_v1` |

## Repo layout

```
docs/              ← source of truth for all *.js logic (still used on main)
web/src/           ← React shell + adapters
web/public/legacy/ ← generated from docs/ on npm run dev/build (gitignored)
web/public/blog/   ← generated from docs/blog/ (gitignored)
```

**Do not** duplicate legacy JS into `web/src/`. Vite copies from `docs/` automatically.

## Local dev

```powershell
cd web
npm install
npm run dev
```

Config loads from `docs/scena-config.js` (copied to `/legacy/scena-config.js`) unless `web/.env` sets `VITE_*` vars.

## Removed / cleaned up

- `web/src/lib/supabase.ts` — duplicate of legacy `scena-auth.js`
- `@supabase/supabase-js` npm dep — legacy uses CDN UMD
- `scripts/sync-legacy-to-web.ps1` — replaced by Vite `copyLegacyFromDocs`
- Unused `feedback` bundle key and `scena-version.js` copy
- `learn-app.js` from React learn bundle — replaced by React routes + components

## Netlify (branch deploy)

```toml
[build]
  base = "web"
  command = "npm ci && npm run build"
  publish = "web/dist"
```

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_REDIRECT_URL`

## Cutover checklist

1. Deploy preview on `react-rewrite`
2. Smoke-test login, read, saves, studio, Conservatory, marketplace
3. Merge to `main` — `docs/` HTML pages retire gradually; keep `docs/*.js` as source until graph is ported
