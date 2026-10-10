import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { absoluteUrl, business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { priceCart, shippingOptionsFor } from "@/lib/checkout";
import { getCheckoutBlockers } from "@/lib/launch";
import { createOrderReference } from "@/lib/order-reference";
import { guardJsonPost, jsonError } from "@/lib/request-security";
import { getStripe } from "@/lib/stripe";
import { checkoutSchema, firstError } from "@/lib/validation";

/**
 * Creates a Stripe Checkout Session from the cart and returns its hosted URL.
 * Card details are entered on Stripe's page — they never touch this server.
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

  const priced = priceCart(parsed.data.lines);
  if (!priced.ok) return jsonError(priced.error, 409);

  const reference = createOrderReference();
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
        metadata: { sku: l.sku },
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
        ? {
            minimum: { unit: "business_day", value: rate.deliveryDays.min },
            maximum: { unit: "business_day", value: rate.deliveryDays.max },
          }
        : undefined,
    },
  }));

  const skuSummary = priced.lines.map((l) => `${l.sku}x${l.quantity}`).join(",").slice(0, 500);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: commerce.shipToCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
      },
      shipping_options: shippingOptions,
      billing_address_collection: "required",
      automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
      client_reference_id: reference,
      metadata: { order_reference: reference, items: skuSummary },
      payment_intent_data: {
        description: `${business.brandName} order ${reference}`,
        metadata: { order_reference: reference },
      },
      success_url: `${absoluteUrl("/checkout/success")}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: absoluteUrl("/cart"),
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("Failed to create checkout session", err);
    return jsonError("We couldn't start checkout. Please try again in a moment.", 502);
  }
}
