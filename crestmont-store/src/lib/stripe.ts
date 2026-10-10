import "server-only";

import Stripe from "stripe";

import { commerce } from "@/config/commerce";

let client: Stripe | null = null;

/**
 * Server-only Stripe client for this store's own Stripe account.
 *
 * Returns null while payments are disabled in config/commerce.ts, regardless
 * of what Stripe variables exist in the environment — so credentials that
 * belong to another application can never be used by accident.
 */
export function getStripe(): Stripe | null {
  if (!commerce.paymentsEnabled) return null;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key, { appInfo: { name: "crestmont-store" } });
  return client;
}
