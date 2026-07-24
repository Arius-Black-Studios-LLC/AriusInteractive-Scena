# Arleco

Interactive fiction platform by **Arius Interactive** — creator studio, reader, and Conservatory learn mode.

**Current version:** see `VERSION` (e.g. `0.1.0-beta`)

## Local preview

```powershell
cd docs
./serve.ps1
```

Open `http://127.0.0.1:5500/scena-design-preview.html`

## Config (local only)

```powershell
copy docs\scena-config.example.js docs\scena-config.js
```

Fill in Supabase URL, anon key, and auth redirect URL. **Never commit** `scena-config.js`.

## Deploy

Push to `main` on GitHub — Actions publishes the `docs/` folder to GitHub Pages. Full steps: **`docs/DEPLOY.md`**.

## Version control

Git workflow, tagging, and branches: **`VERSIONING.md`**. Release notes: **`CHANGELOG.md`**.

## Help

- In-app: `/help.html`
- Discord: https://discord.gg/83V5SQAeez
- Email: help@ariusinteractive.com
