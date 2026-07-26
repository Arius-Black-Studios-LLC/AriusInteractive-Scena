import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Put ?query before #hash so browsers expose params in location.search */
function buildReturnUrl(siteUrl: string, returnPath: string, query: string): string {
  const hashIdx = returnPath.indexOf("#");
  if (hashIdx >= 0) {
    const path = returnPath.slice(0, hashIdx) || "/";
    const hash = returnPath.slice(hashIdx);
    const sep = path.includes("?") ? "&" : "?";
    return `${siteUrl}${path}${sep}${query}${hash}`;
  }
  const sep = returnPath.includes("?") ? "&" : "?";
  return `${siteUrl}${returnPath}${sep}${query}`;
}

/** Must match docs/scena-wallet.js and supabase-wallet.sql */
const PACKS: Record<string, { ducats: number; priceCents: number; label: string }> = {
  ducat_10: { ducats: 10, priceCents: 99, label: "10 Ducats" },
  ducat_55: { ducats: 55, priceCents: 499, label: "55 Ducats" },
  ducat_120: { ducats: 120, priceCents: 999, label: "120 Ducats" },
  ducat_500: { ducats: 500, priceCents: 2499, label: "500 Ducats" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return json({ error: "Stripe is not configured on the server." }, 503);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Sign in to buy Ducats." }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Sign in to buy Ducats." }, 401);
    }

    const body = await req.json();
    const packId = String(body.packId || "");
    const pack = PACKS[packId];
    if (!pack) {
      return json({ error: "Unknown Ducat pack." }, 400);
    }

    const siteUrl =
      String(body.returnUrl || Deno.env.get("SITE_URL") || "https://arleco.app").replace(/\/$/, "");
    const returnPath = String(body.returnPath || "/studio#/library/shop");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pack.priceCents,
            product_data: {
              name: `Arleco ${pack.label}`,
              description: `${pack.ducats} Ducats for chapters, marketplace, and jams`,
              tax_code: "txcd_10000000",
            },
          },
        },
      ],
      metadata: {
        user_id: userData.user.id,
        pack_id: packId,
        ducats: String(pack.ducats),
      },
      client_reference_id: userData.user.id,
      success_url: buildReturnUrl(
        siteUrl,
        returnPath,
        "ducat_purchase=success&session_id={CHECKOUT_SESSION_ID}",
      ),
      cancel_url: buildReturnUrl(siteUrl, returnPath, "ducat_purchase=cancelled"),
    });

    if (!session.url) {
      return json({ error: "Could not start checkout." }, 500);
    }

    return json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("create-ducat-checkout:", err);
    return json({ error: err instanceof Error ? err.message : "Checkout failed." }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
