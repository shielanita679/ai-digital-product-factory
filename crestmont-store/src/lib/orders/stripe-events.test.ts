import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { classifyStripeEvent } from "./stripe-events";

const session = (overrides: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: "cs_test_123",
    object: "checkout.session",
    payment_status: "paid",
    payment_intent: "pi_123",
    currency: "usd",
    amount_subtotal: 5998,
    amount_total: 6498,
    total_details: { amount_discount: 0, amount_shipping: 500, amount_tax: 0 },
    customer_details: { email: "Buyer@Example.TEST", name: "Test Buyer" },
    collected_information: {
      shipping_details: { name: "Test Buyer", address: { line1: "1 Test St", line2: null, city: "Testville", state: "MO", postal_code: "63105", country: "US" } },
    },
    metadata: { order_id: "11111111-1111-1111-1111-111111111111" },
    ...overrides,
  }) as unknown as Stripe.Checkout.Session;

const event = (type: string, object: unknown) => ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;

describe("classifyStripeEvent", () => {
  it("treats a paid completed session as paid and maps server-relevant fields", () => {
    const a = classifyStripeEvent(event("checkout.session.completed", session()));
    expect(a.kind).toBe("paid");
    if (a.kind !== "paid") return;
    expect(a.session).toMatchObject({
      id: "cs_test_123",
      orderId: "11111111-1111-1111-1111-111111111111",
      paymentIntent: "pi_123",
      customerEmail: "buyer@example.test",
      amountSubtotal: 5998,
      amountShipping: 500,
      amountTotal: 6498,
      shipping: { line1: "1 Test St", country: "US" },
    });
  });

  it("a completed but unpaid session (delayed payment) is processing, not paid", () => {
    expect(classifyStripeEvent(event("checkout.session.completed", session({ payment_status: "unpaid" }))).kind).toBe("processing");
  });

  it("maps async success, async failure and expiry", () => {
    expect(classifyStripeEvent(event("checkout.session.async_payment_succeeded", session())).kind).toBe("paid");
    expect(classifyStripeEvent(event("checkout.session.async_payment_failed", session()))).toEqual({ kind: "closed", sessionId: "cs_test_123", outcome: "FAILED" });
    expect(classifyStripeEvent(event("checkout.session.expired", session()))).toEqual({ kind: "closed", sessionId: "cs_test_123", outcome: "EXPIRED" });
  });

  it("maps refunds to money only", () => {
    expect(classifyStripeEvent(event("charge.refunded", { payment_intent: "pi_9", amount_refunded: 1500 }))).toEqual({
      kind: "refund",
      paymentIntentId: "pi_9",
      amountRefunded: 1500,
    });
  });

  it("ignores unrelated events", () => {
    expect(classifyStripeEvent(event("customer.created", {})).kind).toBe("ignore");
  });
});
