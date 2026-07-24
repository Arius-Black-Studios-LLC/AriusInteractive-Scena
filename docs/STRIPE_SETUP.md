# Stripe + Supabase Ducat setup

Ducats are **never granted for free** in production. The browser starts Stripe Checkout; Stripe notifies Supabase; only then are Ducats credited.

## Architecture

```
User clicks pack → Edge Function create-ducat-checkout → Stripe Checkout
                                                              ↓
User pays ←─────────────────────────────────────────── card charged → your Stripe balance
                                                              ↓
                                    Edge Function stripe-webhook (signed)
                                                              ↓
                         grant_ducat_pack_from_stripe (service role only)
                                                              ↓
                                    profiles.ducat_balance += pack size
```

Cash-out still uses `request_creator_cashout` (earned Ducats only). Pay creators manually from `cashout_requests` until you automate payouts.

---

## 1. Supabase SQL (run in order)

In **Supabase → SQL Editor**, run each file once:

1. `docs/supabase-setup.sql`
2. `docs/supabase-wallet.sql`
3. `docs/supabase-wallet-security.sql`
4. `docs/supabase-stripe-wallet.sql`
5. `docs/supabase-jam-wallet.sql` (jam prize pool payout via `jam_payout_winner`)
6. `docs/supabase-profile-ensure.sql` (creates missing profiles — fixes "Profile not found" on spend)
7. `docs/supabase-profile-age.sql` (birth year + adult verification columns)

After step 4, `purchase_ducat_pack` no longer exists and users **cannot** grant themselves Ducats via RPC.

---

## 2. Stripe account

1. Create a [Stripe account](https://dashboard.stripe.com/register).
2. Stay in **Test mode** until you are ready for real charges.
3. Copy **Secret key** (`sk_test_…`) — never put this in the frontend or `scena-config.js`.

---

## 3. Deploy Edge Functions

Install [Supabase CLI](https://supabase.com/docs/guides/cli), link your project:

```bash
cd scena
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set secrets (Supabase Dashboard → Edge Functions → Secrets, or CLI):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...   # after step 4
supabase secrets set SITE_URL=https://your-site.netlify.app
```

Deploy:

```bash
supabase functions deploy create-ducat-checkout
supabase functions deploy stripe-webhook
```

`create-ducat-checkout` requires a logged-in user JWT (`verify_jwt = true`).  
`stripe-webhook` is called by Stripe only (`verify_jwt = false`).

---

## 4. Stripe webhook

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. URL:

   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`

3. Events: **`checkout.session.completed`**
4. Copy the **Signing secret** (`whsec_…`) → set as `STRIPE_WEBHOOK_SECRET` in Supabase secrets.

---

## 5. Netlify / site env

Already required for auth (build writes `scena-config.js`):

| Variable | Purpose |
|----------|---------|
| `SCENA_SUPABASE_URL` | Supabase project URL |
| `SCENA_SUPABASE_ANON_KEY` | Public anon key (frontend) |

Do **not** put Stripe secret keys in Netlify unless you add a Netlify function — Stripe secrets live in **Supabase Edge Function secrets** only.

Redeploy the site after SQL + functions are live.

---

## 6. Test the full flow

1. Sign in on your deployed site.
2. Open **Studio → My assets → Get Ducats** (or marketplace upsell).
3. Click a pack → redirect to Stripe Checkout.
4. Pay with test card **`4242 4242 4242 4242`**, any future expiry, any CVC.
5. Return to the site with `?ducat_purchase=success` — balance should update after webhook (usually within seconds).
6. Verify in Supabase:

```sql
select email, ducat_balance from public.profiles where email = 'you@test.com';
select * from public.stripe_ducat_payments order by created_at desc limit 5;
```

7. **Tamper test** (should fail):

```js
await supabase.from('profiles').update({ ducat_balance: 999999 }).eq('id', userId)
```

---

## 7. Go live

- [ ] Switch Stripe to **Live mode** and update `STRIPE_SECRET_KEY` + webhook endpoint (live `whsec_`).
- [ ] Terms: purchased Ducats non-refundable; earned Ducats cash-out minimum 500 ($14).
- [ ] Process `cashout_requests` manually until Stripe Connect / PayPal payouts are wired.
- [ ] Jam Ducat prizes: winner credit is not browser-callable yet — migrate jams to Supabase before enabling paid jam pools.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| “Stripe is not configured” | `STRIPE_SECRET_KEY` on Supabase function secrets |
| Payment succeeds, no Ducats | Webhook URL, `STRIPE_WEBHOOK_SECRET`, function logs in Supabase |
| “Payment amount mismatch” | Pack prices match in `scena-wallet.js`, SQL `_ducat_pack_price_cents`, and Edge Function `PACKS` |
| Checkout 401 | User must be signed in; JWT passed to `functions.invoke` |
| Old free grants still work | Re-run `supabase-stripe-wallet.sql` to drop `purchase_ducat_pack` |
