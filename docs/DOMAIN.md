# Connect arleco.app to Arleco

You own **arleco.app** — this guide walks through pointing it at Netlify and updating auth so login keeps working.

The site uses short URLs (`/studio`, `/learn`, `/play`, etc.) and redirects old paths like `/scena-design-preview.html` → `/`.

---

## 1. Add the domain in Netlify

1. Open your site in [Netlify](https://app.netlify.com) (currently `scenavisualnovels.netlify.app`).
2. **Site configuration → Domain management → Add a domain → Add a domain you already own**.
3. Enter **`arleco.app`** (and optionally **`www.arleco.app`**).
4. Netlify shows DNS records to add at your registrar (where you bought the domain).

### DNS options

**Option A — Netlify DNS (simplest)**  
Point your domain’s nameservers to Netlify; Netlify manages DNS for you.

**Option B — Keep registrar DNS**  
Add the records Netlify shows, typically:

| Type | Host | Value |
|------|------|--------|
| `A` | `@` | Netlify load balancer IP (shown in dashboard) |
| `CNAME` | `www` | `YOUR-SITE.netlify.app` |

> **Note:** `.app` domains require HTTPS everywhere (Google’s registry policy). Netlify handles this automatically once DNS is correct.

5. Wait for DNS (often 5–30 minutes, sometimes up to 24h).
6. Netlify provisions **HTTPS** (Let’s Encrypt) automatically.
7. Set **`arleco.app`** as the **primary domain** so all traffic uses it.

---

## 2. Update Supabase auth URLs

In [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication → URL configuration**:

| Setting | Value |
|---------|--------|
| **Site URL** | `https://arleco.app/` |
| **Redirect URLs** | Add each line (keep local dev too): |

```
https://arleco.app/
https://arleco.app/studio
https://arleco.app/account
https://arleco.app/learn
http://127.0.0.1:5500/
http://127.0.0.1:5500/studio
http://127.0.0.1:5500/account
```

You can remove old `scenavisualnovels.netlify.app` URLs once the custom domain works, or keep them during transition.

---

## 3. Update Netlify environment variables

**Site configuration → Environment variables:**

| Variable | Value |
|----------|--------|
| `ARLECO_AUTH_REDIRECT_URL` | `https://arleco.app/` |
| `ARLECO_SUPABASE_URL` | (unchanged) |
| `ARLECO_SUPABASE_ANON_KEY` | (unchanged) |

Or use the `SCENA_*` names — both work. Redeploy after saving (**Deploys → Trigger deploy**).

The build script writes `docs/scena-config.js` with the redirect URL at deploy time.

---

## 4. Push and deploy

Commit and push from GitHub Desktop. Netlify deploys with:

- **`/`** — Discover / home
- **`/studio`**, **`/learn`**, **`/play`**, **`/account`**, etc.
- **`docs/_redirects`** — clean URLs + 301s from old `.html` paths

---

## 5. Verify

- [ ] `https://arleco.app/` loads Discover
- [ ] `https://arleco.app/studio` opens creator studio
- [ ] Magic-link login returns to the site (not an error page)
- [ ] `https://arleco.app/scena-design-preview.html` redirects to `/`
- [ ] `https://arleco.app/sitemap.xml` lists `arleco.app` URLs

---

## URL map (old → new)

| Old | New |
|-----|-----|
| `/scena-design-preview.html` | `/` |
| `/studio.html` | `/studio` |
| `/learn.html` | `/learn` |
| `/play.html?…` | `/play?…` |
| `/series.html?…` | `/series?…` |
| `/account.html` | `/account` |
| `/blog.html` | `/blog` |
| `/help.html` | `/help` |

---

## Local preview

```powershell
cd docs
./serve.ps1
```

Open `http://127.0.0.1:5500/` — the local server mirrors the same clean URL paths as Netlify.
