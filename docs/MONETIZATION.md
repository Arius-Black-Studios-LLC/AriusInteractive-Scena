# Arleco Ducat economics

## Where does the money go when someone buys Ducats?

| Stage | What happens | Where the USD goes |
|--------|----------------|---------------------|
| **Purchase** | Reader pays real money (e.g. Stripe) for a Ducat pack | **Arleco (the platform)** — your merchant account |
| **Wallet credit** | Ducats are added to the reader’s `ducat_balance` | No second payment — virtual balance only |
| **Spend** | Reader unlocks a chapter, buys a marketplace asset, joins a jam prize pool, etc. | Ducats move inside the platform (see split below) |
| **Cash-out** | Creator redeems **earned** Ducats for USD | Paid from platform funds to the creator (PayPal, Stripe Connect, etc.) |

**Today (beta):** `purchase_ducat_pack` grants Ducats without charging — Stripe is not wired yet. The flow above is the intended production model.

**Important:** Readers **cannot** sell purchased wallet balance back for cash. Only **creator earnings** (`creator_earned_ducats`) can be cashed out.

---

## Two kinds of Ducats

1. **`ducat_balance`** — bought with USD. Used to unlock chapters, shop, jam pools. **Spend only, no cash-out.**
2. **`creator_earned_ducats`** — earned when others spend Ducats on your chapters or listings (70% of spend). **Can be cashed out** at the rate below.

---

## Reference rates (must match `scena-wallet.js` and `supabase-wallet.sql`)

| | Per Ducat | Example (500 Ducats) |
|--|-----------|----------------------|
| **Reference buy rate** | $0.04 | $20.00 face value |
| **Cash-out rate (70%)** | $0.028 | **$14.00** paid to creator |
| **Platform spread on conversion** | $0.012 (30%) | **$6.00** margin per 500 face at cash-out |

Retail packs may cost **more** than reference (e.g. 500 Ducats for **$24.99**) — that extra margin stays with the platform. Bonus Ducats in smaller packs are marketing; creator earnings are still based on **Ducats spent**, not dollars paid.

When a reader spends **500 Ducats** on your content:

- **350 Ducats** → your earned balance (70% creator share)
- **150 Ducats** → platform share (never cashed out; platform revenue in Ducat terms)

If you cash out those **350 earned Ducats**:

- USD paid to you: 350 × $0.028 = **$9.80**
- Platform already held 150 Ducats + the buy/spread margin from the original purchase

---

## Why buy price > cash-out price

Creators (and the platform) need a spread so arbitrage doesn’t work:

- Buy 500 Ducats for ~$20–25
- Cash out only **earned** Ducats at $14 per 500 **face value** at the reference rate
- You cannot buy Ducats and immediately withdraw them — that closes the loop

The **30%** in your example is the gap between the **$0.04 reference buy rate** and the **$0.028 cash-out rate**. Additional margin comes from pack pricing above reference, the 30% platform share on each spend, and unspent reader balances.

---

## Constants (code)

```js
CREATOR_SHARE: 0.7
REFERENCE_RETAIL_CENTS_PER_DUCAT: 4   // $20 / 500
CASHOUT_RATIO: 0.7                  // 70% of reference → $0.028 / Ducat
MIN_CASHOUT_DUCATS: 500               // minimum $14.00 cash-out
```

---

## Production checklist

See **`docs/STRIPE_SETUP.md`** for step-by-step Stripe + Supabase deployment.

- [x] Stripe Checkout via Supabase Edge Function (no free `purchase_ducat_pack`)
- [ ] Run all SQL migrations including `supabase-stripe-wallet.sql`
- [ ] Deploy Edge Functions + Stripe webhook
- [ ] Run `supabase-wallet-security.sql` (blocks direct profile PATCH on wallet columns)
- [ ] Process `cashout_requests` manually until automated payouts
- [ ] Terms of service: purchased balance non-refundable, earned balance subject to minimum cash-out

---

## Minimum cash-out (common confusion)

| Concept | Amount |
|---------|--------|
| **Minimum cash-out** | **500 earned Ducats** |
| **USD paid at cash-out** | **$14.00** (500 × $0.028) |
| **$20 reference** | Face value when **buying** 500 Ducats at the reference rate — **not** the cash-out minimum |

Creators need **500 earned Ducats** (from other people spending on their work), not 500 Ducats in their spending wallet. Purchased balance **cannot** be cashed out at all.

---

## How to test money in / money out

### Phase 1 — Local beta (no real money, **not secure**)

Use this only on your own machine to click through UI flows.

1. Sign in, open **Studio → My assets → Get Ducats** (or marketplace upsell).
2. Buy a pack — balance increases via `localStorage` key `arleco_wallet_<userId>`.
3. Spend Ducats (marketplace / chapter unlock / jam pool) — balance drops in localStorage.
4. **Cash-out:** only works on `creatorEarned` in localStorage; earning requires another account spending on your content (local demo does not credit cross-user earnings well).

**Limitation:** Anyone can edit localStorage in DevTools. Phase 1 proves UI only, not security.

### Phase 2 — Supabase RPC (real server ledger, still free packs)

1. Apply `supabase-setup.sql`, `supabase-wallet.sql`, and **`supabase-wallet-security.sql`**.
2. Deploy with Supabase env vars so the site uses cloud wallet (`wallet_snapshot` RPC).
3. **Test “money in” (beta grant):**

```sql
-- As yourself in the app: click a pack, then verify in SQL Editor:
select id, ducat_balance, creator_earned_ducats from public.profiles where email = 'you@example.com';
```

Or call RPC manually (simulates what the app does today):

```sql
select public.purchase_ducat_pack('ducat_10');  -- run while authenticated as test user via Supabase client, or use Dashboard RPC with user JWT
```

4. **Test spend → creator earn:** Account A buys Ducats; Account B publishes a paid chapter; A unlocks with Ducats; check B:

```sql
select creator_earned_ducats from public.profiles where id = '<creator-uuid>';
select * from public.creator_earnings order by created_at desc limit 5;
```

5. **Test “money out” (cash-out request):** As creator with ≥500 earned:

```sql
select public.request_creator_cashout(500);
select * from public.cashout_requests order by requested_at desc limit 5;
-- expect usd_cents = 1400 ($14.00)
```

6. **Tamper test (should fail after security SQL):** In browser console:

```js
await supabase.from('profiles').update({ ducat_balance: 999999 }).eq('id', userId)
// Expected: error "Wallet balances are server-managed"
```

### Phase 3 — Stripe test mode (real payment path)

1. Create Stripe Checkout for pack price (e.g. `ducat_500` → $24.99).
2. **Do not** call `purchase_ducat_pack` from the browser.
3. Stripe webhook (`checkout.session.completed`) → Supabase Edge Function with **service role** → verify amount + pack id → `purchase_ducat_pack` or insert into `ducat_ledger` + increment balance.
4. Use [Stripe test cards](https://docs.stripe.com/testing) (e.g. `4242…`).
5. Cash-out: mark `cashout_requests` as `paid` manually at first; later automate via Stripe Connect / PayPal payouts.

---

## Security: how users could rob you (and how to stop it)

| Attack | Risk today | Fix |
|--------|------------|-----|
| Edit `localStorage` `arleco_wallet_*` | **High** when Supabase is off | Require Supabase in production; treat local wallet as demo-only |
| `supabase.from('profiles').update({ ducat_balance: 999999 })` | **High** without trigger | Run **`supabase-wallet-security.sql`** |
| Call `purchase_ducat_pack` without paying | **High** in beta | Before launch: **revoke** from `authenticated`; webhook + service role only |
| Call `request_creator_cashout` on spending wallet | **Low** — RPC only debits `creator_earned_ducats` | Already separated; keep it that way |
| Buy Ducats → cash out same account | **Blocked by design** | Spending wallet ≠ earned wallet; no RPC converts balance → earned |
| Jam / `spendBalance` in JS | **Medium** — client-side when used | Move jam pools to server RPC (future); use Supabase for marketplace/chapters |
| Fake Stripe webhook | **Medium** at launch | Verify webhook signature; idempotency keys; match payment amount to pack |

**Golden rule:** The browser is hostile. **Never trust** client-reported balances. Every credit and debit must go through **SECURITY DEFINER** Postgres functions (or Edge Functions with service role) that re-read balances with `FOR UPDATE`, check invariants, and write audit rows.

**Before you take real money:**

1. Run `supabase-wallet-security.sql`
2. Disable free `purchase_ducat_pack` for users
3. Wire Stripe webhook → server-only grant
4. Manually review `cashout_requests` until automated payouts are trusted
5. Disable or server-gate localStorage wallet fallback in production builds
