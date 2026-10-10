import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

/** Server-only Stripe client. Returns null when no secret key is configured. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { appInfo: { name: "crestmont-store" } });
  return client;
}
