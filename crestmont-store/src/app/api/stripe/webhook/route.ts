import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";

/**
 * Stripe webhook. Configure in the Stripe dashboard pointing at
 * https://<your-domain>/api/stripe/webhook with the events below, and set
 * STRIPE_WEBHOOK_SECRET to that endpoint's signing secret.
 *
 * Every request is verified against the signing secret before use.
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

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        // Fulfillment hook: forward to your order management / fulfillment
        // system and decrement inventory here. Stripe also keeps the full
        // order (line items, shipping address) on the Checkout Session.
        console.info(`Order paid: ${session.metadata?.order_reference ?? session.id} — ${session.amount_total} ${session.currency}`);
      }
      break;
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.warn(`Payment failed for order ${session.metadata?.order_reference ?? session.id}`);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
