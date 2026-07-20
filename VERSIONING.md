# Version control

This project uses **Git** for source history and **semver tags** for beta releases.

## One-time setup

1. Install [Git for Windows](https://git-scm.com/download/win) if you do not have it yet.
2. In a terminal at the repo root (`scena`):

```powershell
git init
git add .
git status
```

Confirm **`docs/scena-config.js` is NOT listed** (it is gitignored — it holds your Supabase keys).

3. First commit:

```powershell
git commit -m "Initial Scena beta — studio, reader, learn, deploy workflow"
```

4. Create a GitHub repo and connect:

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

GitHub Pages deploy runs automatically from `.github/workflows/deploy-pages.yml` on push to `main`.

## Secrets

| File | Commit? |
|------|---------|
| `docs/scena-config.example.js` | Yes (placeholder keys) |
| `docs/scena-config.js` | **Never** — local only |

On a new machine: `copy docs\scena-config.example.js docs\scena-config.js` and fill in keys.

## Release versions

| File | Purpose |
|------|---------|
| `VERSION` | Single source of truth (e.g. `0.1.0-beta`) |
| `docs/scena-version.js` | Exposed to the app UI for support/debug |
| `CHANGELOG.md` | Human-readable release notes |

When you ship a beta milestone:

1. Bump `VERSION` and `docs/scena-version.js` (`app` field).
2. Add a section to `CHANGELOG.md`.
3. Commit and tag:

```powershell
git add VERSION docs/scena-version.js CHANGELOG.md
git commit -m "Release v0.1.0-beta"
git tag -a v0.1.0-beta -m "First public beta for creators"
git push origin main --tags
```

## Suggested branches

| Branch | Use |
|--------|-----|
| `main` | Deployed to GitHub Pages — stable beta |
| `dev` | Day-to-day work; merge to `main` when ready |

For hotfixes on beta, branch from `main`, fix, merge back, tag patch (`0.1.1-beta`).

## Cache busting

Static HTML loads assets with `?v=N` query strings. When you change CSS/JS, bump those version numbers in the HTML files so browsers pick up updates (or tie bumps to git tags in your release checklist).
