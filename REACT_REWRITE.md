# Arleco React rewrite (`react-rewrite` branch)

Production on **`main`** still serves static **`docs/`**. This branch runs **`web/`** (Vite + React + TypeScript) with legacy JS **bridged** for user data compatibility.

## Architecture (honest answer)

This is **not** a full React rewrite of domain logic yet. It is a **hybrid shell**:

| Layer | Owns |
|-------|------|
| **React (`web/src/`)** | Routing, site chrome, home/discover UI, static pages, auth modal |
| **Legacy (`docs/*.js`)** | Player, studio graph, Conservatory lessons, saves, marketplace, Supabase auth |
| **Bridge (`web/src/legacy/`)** | Script bundles, config loader, typed adapters |

### Conservatory — not React components

The Conservatory looks the same because **it is the same code**. React only provides the page shell (`LearnPage.tsx`) and calls `startLearnApp()` via `legacy/adapters.ts`.

Node types, graph editor, lesson validators, and mascots still live in:

- `docs/studio-graph.js` — graph UI, block palette (dialogue, choice, logic, key-item, flow-gate)
- `docs/learn-lessons.js` — 18 lessons, setup graphs, validate()
- `docs/learn-sandbox.js` — wraps `ScenaGraphEditor` in learn mode
- `docs/learn-app.js` — catalog, hash routing, lesson runner
- `docs/studio-store.js` — node/edge schema

**Nothing in React defines graph nodes.** That is intentional for this phase — zero risk to creator data and faster cutover.

### SOLID today

| Principle | Status |
|-----------|--------|
| **S** Single responsibility | React pages are thin shells ✓. Legacy `studio-graph.js` is a god object ✗ |
| **O** Open/closed | New node types require editing legacy JS, not extending React ✗ |
| **L** Liskov | N/A |
| **I** Interface segregation | Per-route script bundles (`LEGACY_BUNDLES`) ✓ |
| **D** Dependency inversion | Pages use `legacy/adapters.ts` instead of raw `window.*` (partial ✓) |

### Future migration order (when you want real React components)

1. **Data** — extract lesson definitions to typed TS modules
2. **Catalog UI** — React lesson list, badges, progress
3. **Graph editor last** — largest piece; keep legacy widget embedded until ready

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
