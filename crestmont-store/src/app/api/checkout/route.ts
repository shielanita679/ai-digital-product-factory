import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { absoluteUrl, business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { priceCart, shippingOptionsFor } from "@/lib/checkout";
import { getCheckoutBlockers } from "@/lib/launch";
import * as orders from "@/lib/orders/repository";
import { buildOrderItemsSnapshot, CHECKOUT_SESSION_MINUTES, RESERVATION_GRACE_MINUTES } from "@/lib/orders/snapshot";
import { guardJsonPost, jsonError } from "@/lib/request-security";
import { getStripe } from "@/lib/stripe";
import { checkoutSchema, firstError } from "@/lib/validation";

/**
 * Starts checkout. Flow (only reachable once payments AND the order database
 * are enabled — see getCheckoutBlockers):
 *
 *   1. Validate SKUs/quantities; re-price from the server-side catalog.
 *   2. create_pending_order: one DB transaction that snapshots the items and
 *      reserves stock atomically. Insufficient stock fails here, before any
 *      payment session exists.
 *   3. Create the Stripe Checkout Session (expires in 30 minutes) carrying
 *      the order id/number in metadata.
 *   4. Link the session to the order. If Stripe fails, the reservation is
 *      released immediately.
 *
 * Nothing here marks an order paid or deducts stock — only the verified
 * Stripe webhook does. Card details are entered on Stripe's page.
 */
export async function POST(request: Request) {
  const guard = await guardJsonPost(request, { bucket: "checkout", limit: 10, windowMs: 60_000 });
  if ("response" in guard) return guard.response;

  const stripe = getStripe();
  const blockers = getCheckoutBlockers();
  if (!stripe || blockers.length > 0) {
    if (process.env.NODE_ENV !== "production") console.warn("Checkout disabled:", blockers);
    return jsonError("Online checkout isn't open yet. No payment has been taken.", 503);
  }

  const parsed = checkoutSchema.safeParse(guard.body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);

  const priced = priceCart(parsed.data.lines, { checkCatalogStock: false });
  if (!priced.ok) return jsonError(priced.error, 409);

  const sessionExpiresAt = new Date(Date.now() + CHECKOUT_SESSION_MINUTES * 60_000);
  const reservationExpiresAt = new Date(sessionExpiresAt.getTime() + RESERVATION_GRACE_MINUTES * 60_000);

  let order: { orderId: string; orderNumber: string };
  try {
    order = await orders.createPendingOrder(commerce.currency, buildOrderItemsSnapshot(priced.lines), reservationExpiresAt);
  } catch (err) {
    if (err instanceof orders.InsufficientStockError) {
      return jsonError("Sorry — one of the items in your cart just sold out or has limited stock. Please review your cart.", 409);
    }
    console.error("Could not create pending order", err);
    return jsonError("We couldn't start checkout. Please try again in a moment.", 502);
  }

  const canUseImages = business.siteUrl.startsWith("https://");
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priced.lines.map((l) => ({
    quantity: l.quantity,
    price_data: {
      currency: commerce.currency.toLowerCase(),
      unit_amount: l.unitAmountCents,
      tax_behavior: "exclusive",
      product_data: {
        name: l.name,
        description: l.variant || undefined,
        images: canUseImages && l.image ? [absoluteUrl(l.image)] : undefined,
        metadata: { sku: l.sku, product_id: l.productId },
      },
    },
  }));

  const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = shippingOptionsFor(priced.subtotalCents).map((rate) => ({
    shipping_rate_data: {
      type: "fixed_amount",
      display_name: rate.label,
      fixed_amount: { amount: rate.amountCents, currency: commerce.currency.toLowerCase() },
      tax_behavior: "exclusive",
      delivery_estimate: rate.deliveryDays
        ? { minimum: { unit: "business_day", value: rate.deliveryDays.min }, maximum: { unit: "business_day", value: rate.deliveryDays.max } }
        : undefined,
    },
  }));

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: lineItems,
        expires_at: Math.floor(sessionExpiresAt.getTime() / 1000),
        shipping_address_collection: {
          allowed_countries: commerce.shipToCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
        },
        shipping_options: shippingOptions,
        billing_address_collection: "required",
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
        client_reference_id: order.orderNumber,
        metadata: { order_id: order.orderId, order_number: order.orderNumber },
        payment_intent_data: {
          description: `${business.brandName} order ${order.orderNumber}`,
          metadata: { order_id: order.orderId, order_number: order.orderNumber },
        },
        success_url: `${absoluteUrl("/checkout/success")}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: absoluteUrl("/cart"),
      },
      { idempotencyKey: `checkout-${order.orderId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    await orders.attachCheckoutSession(order.orderId, session.id);
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("Failed to create checkout session", err);
    await orders.cancelPendingOrder(order.orderId).catch((e) => console.error("Could not release reservation", e));
    return jsonError("We couldn't start checkout. Please try again in a moment.", 502);
  }
}
