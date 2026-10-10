import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { isOrderDatabaseEnabled } from "@/lib/db/config";
import { processStripeEvent } from "@/lib/orders/webhook";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe webhook — the single authority for payment outcomes.
 *
 * Endpoint: https://<domain>/api/stripe/webhook, subscribed to the events in
 * HANDLED_STRIPE_EVENTS (lib/orders/stripe-events.ts). Every request is
 * signature-verified before use. Processing is idempotent in the database,
 * so Stripe's retries and duplicate deliveries are safe.
 *
 * Returns 503 while payments or the order database are disabled, so Stripe
 * keeps retrying instead of an event being silently dropped.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!isOrderDatabaseEnabled()) {
    console.error(`Stripe event ${event.id} received but the order database is not enabled`);
    return NextResponse.json({ error: "Order database not configured" }, { status: 503 });
  }

  const outcome = await processStripeEvent(event);
  return NextResponse.json({ received: true, result: outcome.result }, { status: outcome.ok ? 200 : 500 });
}
