import type Stripe from "stripe";

import type { PaidSessionInput } from "./types";

/**
 * Decides what a verified Stripe event means for an order. Pure: no I/O.
 *
 * Only the webhook decides payment outcomes. A customer reaching the
 * success page proves nothing and changes nothing.
 */
export type StripeEventAction =
  | { kind: "paid"; session: PaidSessionInput }
  | { kind: "processing"; sessionId: string }
  | { kind: "closed"; sessionId: string; outcome: "EXPIRED" | "FAILED" }
  | { kind: "refund"; paymentIntentId: string; amountRefunded: number }
  | { kind: "ignore" };

/** Event types the Stripe webhook endpoint should be subscribed to. */
export const HANDLED_STRIPE_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
] as const;

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function toPaidSessionInput(session: Stripe.Checkout.Session): PaidSessionInput {
  const shipping = session.collected_information?.shipping_details ?? null;
  const address = shipping?.address ?? null;
  return {
    id: session.id,
    orderId: session.metadata?.order_id ?? null,
    paymentIntent: idOf(session.payment_intent),
    customerEmail: session.customer_details?.email?.toLowerCase() ?? null,
    customerName: session.customer_details?.name ?? null,
    shipping: {
      name: shipping?.name ?? null,
      line1: address?.line1 ?? null,
      line2: address?.line2 ?? null,
      city: address?.city ?? null,
      state: address?.state ?? null,
      postalCode: address?.postal_code ?? null,
      country: address?.country ?? null,
    },
    currency: (session.currency ?? "").toLowerCase(),
    amountSubtotal: session.amount_subtotal ?? 0,
    amountShipping: session.total_details?.amount_shipping ?? 0,
    amountTax: session.total_details?.amount_tax ?? 0,
    amountDiscount: session.total_details?.amount_discount ?? 0,
    amountTotal: session.amount_total ?? 0,
  };
}

export function classifyStripeEvent(event: Stripe.Event): StripeEventAction {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
        return { kind: "paid", session: toPaidSessionInput(session) };
      }
      // Delayed payment method: the outcome arrives later as
      // async_payment_succeeded / async_payment_failed.
      return { kind: "processing", sessionId: session.id };
    }
    case "checkout.session.async_payment_succeeded":
      return { kind: "paid", session: toPaidSessionInput(event.data.object) };
    case "checkout.session.async_payment_failed":
      return { kind: "closed", sessionId: event.data.object.id, outcome: "FAILED" };
    case "checkout.session.expired":
      return { kind: "closed", sessionId: event.data.object.id, outcome: "EXPIRED" };
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId = idOf(charge.payment_intent);
      if (!paymentIntentId) return { kind: "ignore" };
      return { kind: "refund", paymentIntentId, amountRefunded: charge.amount_refunded };
    }
    default:
      return { kind: "ignore" };
  }
}
