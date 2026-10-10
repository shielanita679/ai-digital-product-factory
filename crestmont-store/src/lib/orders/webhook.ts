import "server-only";

import type Stripe from "stripe";

import * as orders from "./repository";
import { DELAYED_PAYMENT_HOLD_DAYS } from "./snapshot";
import { classifyStripeEvent } from "./stripe-events";

/**
 * Applies a signature-verified Stripe event to the database exactly once.
 * Returns ok:false when processing failed; the route then answers 500 so
 * Stripe retries. Idempotency is enforced in the database (stripe_events),
 * so retries and duplicate deliveries are safe.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<{ ok: boolean; result: string }> {
  const action = classifyStripeEvent(event);
  try {
    switch (action.kind) {
      case "paid": {
        const r = await orders.handleCheckoutPaid(event.id, event.type, action.session);
        if (r?.result === "paid_requires_review") console.warn(`Order ${r.orderNumber} paid but requires review`);
        return { ok: true, result: r?.result ?? "unknown" };
      }
      case "processing": {
        const holdUntil = new Date(Date.now() + DELAYED_PAYMENT_HOLD_DAYS * 86_400_000);
        const r = await orders.handleCheckoutProcessing(event.id, event.type, action.sessionId, holdUntil);
        return { ok: true, result: r?.result ?? "unknown" };
      }
      case "closed": {
        const r = await orders.handleCheckoutClosed(event.id, event.type, action.sessionId, action.outcome);
        return { ok: true, result: r?.result ?? "unknown" };
      }
      case "refund": {
        const r = await orders.recordRefund(event.id, event.type, action.paymentIntentId, action.amountRefunded);
        return { ok: true, result: r?.result ?? "unknown" };
      }
      case "ignore":
        await orders.recordIgnoredStripeEvent(event.id, event.type);
        return { ok: true, result: "ignored" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Stripe event ${event.id} (${event.type}) failed: ${message}`);
    try {
      await orders.recordStripeEventFailure(event.id, event.type, message);
    } catch (recordErr) {
      console.error("Could not record Stripe event failure", recordErr);
    }
    return { ok: false, result: "failed" };
  }
}
