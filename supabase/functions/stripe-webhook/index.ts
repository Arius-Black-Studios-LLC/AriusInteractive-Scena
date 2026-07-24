import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response("Server misconfigured", { status: 503 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("stripe-webhook signature:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ ok: true, skipped: "not_paid" }), { status: 200 });
    }

    const userId = session.metadata?.user_id;
    const packId = session.metadata?.pack_id;
    const amountCents = session.amount_total;

    if (!userId || !packId || amountCents == null) {
      console.error("stripe-webhook missing metadata", session.id);
      return new Response("Missing metadata", { status: 400 });
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
      return new Response(error.message, { status: 500 });
    }

    console.log("Granted Ducats", data);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
