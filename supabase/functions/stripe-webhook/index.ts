import Stripe from "npm:stripe@14.21.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server misconfigured", missing: {
      stripe: !stripeKey,
      webhookSecret: !webhookSecret,
      url: !supabaseUrl,
      serviceRole: !serviceRoleKey,
    }}, 503);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing stripe-signature header" }, 400);
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signature verification failed";
    console.error("stripe-webhook signature:", msg);
    return json({
      error: "Invalid webhook signature",
      hint: "Copy the Signing secret (whsec_...) from THIS webhook endpoint in Stripe → Edge Functions → Secrets → STRIPE_WEBHOOK_SECRET, then redeploy.",
      detail: msg,
    }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return json({ ok: true, skipped: "not_paid" });
    }

    const userId = session.metadata?.user_id || session.client_reference_id;
    const packId = session.metadata?.pack_id;
    const amountCents = session.amount_total;

    if (!userId || !packId || amountCents == null) {
      console.error("stripe-webhook missing metadata", {
        sessionId: session.id,
        userId,
        packId,
        amountCents,
        metadata: session.metadata,
      });
      return json({
        error: "Missing checkout metadata",
        sessionId: session.id,
        userId: userId || null,
        packId: packId || null,
        amountCents,
      }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await admin.rpc("grant_ducat_pack_from_stripe", {
      p_user_id: userId,
      p_pack_id: packId,
      p_stripe_session_id: session.id,
      p_amount_cents: amountCents,
      p_stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
    });

    if (error) {
      console.error("grant_ducat_pack_from_stripe:", error.message);
      return json({ error: "Grant failed", detail: error.message }, 500);
    }

    console.log("Granted Ducats", data);
    return json({ received: true, granted: data });
  }

  return json({ received: true, type: event.type });
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
