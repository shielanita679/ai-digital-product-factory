import Stripe from "stripe";

import { getStripeEnv } from "@/lib/stripe/stripe-env";

/**
 * Server-only Stripe SDK instance. Every call site goes through
 * getStripeEnv() first (see its own doc comment) — by the time this
 * function returns, the secret key has already been verified as
 * test-mode. Pinning apiVersion explicitly (rather than relying on the
 * account's dashboard-configured default) keeps webhook payload shape and
 * request/response shape stable regardless of what the connected Stripe
 * account's default API version is set to.
 */
export function getStripeClient(): Stripe {
  const env = getStripeEnv();
  return new Stripe(env.secretKey, {
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
  });
}
