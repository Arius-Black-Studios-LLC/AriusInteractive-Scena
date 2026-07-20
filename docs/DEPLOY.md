# Deploy Scena for beta creators

Scena is a static site in the `docs/` folder. Host it on **GitHub Pages** (free) and point Supabase auth at your live URL.

## 1. GitHub Pages (recommended)

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions**
3. Push to `main` — the workflow in `.github/workflows/deploy-pages.yml` publishes the `docs/` folder automatically.
4. Your site URL will be:
   - `https://YOUR_GITHUB_USER.github.io/YOUR_REPO/`
   - Entry: `https://YOUR_GITHUB_USER.github.io/YOUR_REPO/scena-design-preview.html`
   - Or root `index.html` redirects to Discover.

Optional custom domain (e.g. `scena.ariusinteractive.com`): add it under Pages settings and a DNS `CNAME` record.

## 2. Supabase configuration

In [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication → URL configuration**:

| Setting | Value |
|---------|--------|
| **Site URL** | `https://YOUR_GITHUB_USER.github.io/YOUR_REPO/scena-design-preview.html` |
| **Redirect URLs** | Same URL, plus `.../studio.html`, `.../account.html`, `.../learn.html` |

Run these SQL files once in the SQL editor (in order):

1. `supabase-setup.sql`
2. `supabase-profile-fields.sql` (if profiles lack username/avatar)
3. `supabase-cloud-setup.sql`
4. `supabase-reader-data.sql` (comments, progress, chapter read stats)
5. `supabase-badges-setup.sql` (optional)

## 3. Client config

Copy `scena-config.example.js` → `scena-config.js` and fill in:

```js
window.SCENA_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  authRedirectUrl: "https://YOUR_GITHUB_USER.github.io/YOUR_REPO/scena-design-preview.html",
};
```

**Important:** `scena-config.js` contains your anon key (public by design). Do not commit service-role keys.

After editing config, redeploy (push to `main`).

## 4. Beta creator onboarding

Share these links:

| Page | Purpose |
|------|---------|
| `/scena-design-preview.html` | Discover + log in |
| `/studio.html` | Creator studio |
| `/learn.html` | Conservatory lessons |
| `/help.html` | Help + [Discord](https://discord.gg/83V5SQAeez) |

Creators log in with **Creator** tab → magic link → open studio → publish or **schedule** chapters from episode details.

## 5. Local preview

```powershell
cd docs
./serve.ps1
```

Open `http://127.0.0.1:5500/scena-design-preview.html`

## Scheduled publishing

In the graph editor, open **Episode details** for a chapter:

- **Publish now** — live immediately on Discover (when validation passes)
- **Schedule for** — pick date/time; readers see “Coming soon” until then

Stored on each episode as `publishAt` / `publishedAt` (ISO UTC). Future early-access paywalls can gate on the same field.
