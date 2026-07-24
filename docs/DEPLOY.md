# Deploy Arleco

Arleco is a static site in the `docs/` folder. Production hosting is **Netlify**; see **DOMAIN.md** for connecting **arleco.app**.

## 1. Netlify (production)

1. Push this repo to GitHub and connect the repo in Netlify.
2. Build settings (also in `netlify.toml`):
   - **Publish directory:** `docs`
   - **Build command:** `node scripts/write-scena-config.js`
3. Set environment variables (Site configuration → Environment variables):

| Variable | Example |
|----------|---------|
| `ARLECO_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `ARLECO_SUPABASE_ANON_KEY` | your anon key |
| `ARLECO_AUTH_REDIRECT_URL` | `https://arleco.app/` |

4. Deploy — your site is live at the Netlify subdomain until the custom domain is connected.

## 2. Supabase configuration

In [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication → URL configuration**:

| Setting | Value |
|---------|--------|
| **Site URL** | `https://arleco.app/` |
| **Redirect URLs** | `/`, `/studio`, `/account`, `/learn` on production and `http://127.0.0.1:5500/…` for local dev |

See **DOMAIN.md** for the full redirect URL list.

Run these SQL files once in the SQL editor (in order):

1. `supabase-setup.sql`
2. `supabase-profile-fields.sql` (if profiles lack username/avatar)
3. `supabase-cloud-setup.sql`
4. `supabase-reader-data.sql` (comments, progress, chapter read stats)
5. `supabase-badges-setup.sql` (optional)

## 3. Client config (local only)

Copy `scena-config.example.js` → `scena-config.js` for local preview. On Netlify, `scena-config.js` is generated at build time — do not commit production keys if you prefer env-only deploys.

```js
window.ARLECO_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  authRedirectUrl: "http://127.0.0.1:5500/",
};
```

## 4. Share links with beta creators

| Page | URL |
|------|-----|
| Discover + log in | `https://arleco.app/` |
| Creator studio | `https://arleco.app/studio` |
| Conservatory | `https://arleco.app/learn` |
| Help | `https://arleco.app/help` |

## 5. Local preview

```powershell
cd docs
./serve.ps1
```

Open `http://127.0.0.1:5500/` — clean paths like `/studio` work locally too.

## Scheduled publishing

In the graph editor, open **Episode details** for a chapter:

- **Publish now** — live immediately on Discover (when validation passes)
- **Schedule for** — pick date/time; readers see “Coming soon” until then

Stored on each episode as `publishAt` / `publishedAt` (ISO UTC).
