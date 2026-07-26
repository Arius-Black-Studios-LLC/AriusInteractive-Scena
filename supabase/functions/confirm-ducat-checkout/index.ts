import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey || !serviceRoleKey) {
      return json({ error: "Server not configured." }, 503);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Sign in to confirm purchase." }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Sign in to confirm purchase." }, 401);
    }

    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    if (!sessionId) {
      return json({ error: "Missing checkout session." }, 400);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return json({ error: "Payment not completed yet." }, 409);
    }

    const metaUserId = session.metadata?.user_id || session.client_reference_id;
    if (!metaUserId || metaUserId !== userData.user.id) {
      return json({ error: "This checkout session does not belong to your account." }, 403);
    }

    const packId = session.metadata?.pack_id;
    const amountCents = session.amount_total;
    if (!packId || amountCents == null) {
      return json({ error: "Checkout session missing pack metadata." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await admin.rpc("grant_ducat_pack_from_stripe", {
      p_user_id: metaUserId,
      p_pack_id: packId,
      p_stripe_session_id: session.id,
      p_amount_cents: amountCents,
      p_stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
    });

    if (error) {
      console.error("confirm-ducat-checkout grant:", error.message);
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, ...(data as Record<string, unknown>) });
  } catch (err) {
    console.error("confirm-ducat-checkout:", err);
    return json({ error: err instanceof Error ? err.message : "Confirm failed." }, 500);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
