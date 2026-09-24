import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import { getStripeClient } from "@/lib/stripe/stripe-client";
import { getStripeEnvSafe } from "@/lib/stripe/stripe-env";
import { getStripePriceId, getPlan, type PurchasablePlanId } from "@/config/plans";
import { friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { isEntitledStatus } from "@/config/subscription";

export type StripeServiceErrorCode = "not_configured" | "price_not_configured" | "invalid_config" | "already_subscribed" | "stripe_error" | "db_error";

export class StripeServiceError extends Error {
  readonly code: StripeServiceErrorCode;
  constructor(message: string, code: StripeServiceErrorCode) {
    super(message);
    this.name = "StripeServiceError";
    this.code = code;
  }
}

/**
 * Resolves the ONE canonical Stripe Customer for this user, creating it
 * the first time. Never trusts a customer id from the browser — the only
 * inputs are the caller's own verified user_id/email, both already
 * established server-side by requireUser() before this is ever called.
 * Uses the service-role client so the mapping can be written even though
 * `stripe_customers` has no write policy for `authenticated` (see the
 * migration's own comment on that table).
 */
export async function getOrCreateCustomerId(serviceRoleSupabase: SupabaseClient<Database>, userId: string, email: string): Promise<string> {
  const { data: existing, error: readError } = await serviceRoleSupabase.from("stripe_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (readError) throw new StripeServiceError(friendlyDbErrorMessage(readError, "Could not load your billing profile."), "db_error");
  if (existing) return existing.stripe_customer_id;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email,
    // Only a stable, non-sensitive identifier — never anything else (Phase
    // 11 spec section 30: no tokens, no private profile data).
    metadata: { user_id: userId },
  });

  const { error: insertError } = await serviceRoleSupabase.from("stripe_customers").insert({ user_id: userId, stripe_customer_id: customer.id });
  if (insertError) {
    if (insertError.code === "23505") {
      // Lost a race to a concurrent call for the same user — re-read the
      // winner's row rather than leaving two Stripe Customers for one
      // user. The just-created `customer` here becomes an orphan on
      // Stripe's side (test mode only, harmless) but is never referenced
      // by our own data.
      const { data: winner } = await serviceRoleSupabase.from("stripe_customers").select("stripe_customer_id").eq("user_id", userId).single();
      if (winner) return winner.stripe_customer_id;
    }
    throw new StripeServiceError(friendlyDbErrorMessage(insertError, "Could not save your billing profile."), "db_error");
  }
  return customer.id;
}

/**
 * Server-authoritative Checkout Session creation (Phase 11 spec section
 * 8). The browser sends only `planKey` — a safe internal intent, never a
 * price id, customer id, or amount. This function resolves everything
 * else: the plan's configured TEST Price ID (never invented, never
 * trusted from the client), the user's canonical Stripe Customer, and
 * fixed success/cancel URLs. Returns a redirect URL, never grants
 * anything — Checkout completion is proof of nothing until a verified
 * webhook says otherwise (see WebhookService).
 */
export async function createCheckoutSession(
  serviceRoleSupabase: SupabaseClient<Database>,
  input: { userId: string; email: string; planId: PurchasablePlanId; appUrl: string },
): Promise<{ url: string }> {
  const priceId = getStripePriceId(input.planId);
  if (!priceId) {
    throw new StripeServiceError(`${getPlan(input.planId).name} isn't available for checkout in this environment (no Stripe Price configured).`, "price_not_configured");
  }

  // Checkout duplicate protection (Phase 11 spec sections 31/32): an
  // already-entitled subscriber must be sent to the Billing Portal to
  // change plans, never routed through Checkout again — Checkout always
  // creates a NEW subscription, so blindly allowing it here could leave a
  // user with two simultaneous active subscriptions.
  const { data: existingSub, error: subError } = await serviceRoleSupabase.from("subscriptions").select("status").eq("user_id", input.userId).maybeSingle();
  if (subError) throw new StripeServiceError(friendlyDbErrorMessage(subError, "Could not check your subscription status."), "db_error");
  if (existingSub && isEntitledStatus(existingSub.status)) {
    throw new StripeServiceError("You already have an active subscription. Use Manage Billing to change plans.", "already_subscribed");
  }

  const customerId = await getOrCreateCustomerId(serviceRoleSupabase, input.userId, input.email);

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${input.appUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${input.appUrl}/dashboard/billing?checkout=cancelled`,
    // Belt-and-suspenders alongside client_reference_id: the subscription
    // object itself (not just the Checkout Session) carries user_id, so
    // WebhookService can resolve ownership directly from
    // customer.subscription.* events without depending on the Checkout
    // Session at all.
    subscription_data: { metadata: { user_id: input.userId } },
  });

  if (!session.url) {
    throw new StripeServiceError("Stripe did not return a Checkout URL. Please try again.", "stripe_error");
  }
  return { url: session.url };
}

/**
 * Stripe-hosted Billing Portal (Phase 11 spec section 13) — no custom
 * card-management UI. Loads the canonical customer id server-side; never
 * accepts one from the browser.
 */
export async function createBillingPortalSession(serviceRoleSupabase: SupabaseClient<Database>, input: { userId: string; appUrl: string }): Promise<{ url: string }> {
  const { data: customer, error } = await serviceRoleSupabase.from("stripe_customers").select("stripe_customer_id").eq("user_id", input.userId).maybeSingle();
  if (error) throw new StripeServiceError(friendlyDbErrorMessage(error, "Could not load your billing profile."), "db_error");
  if (!customer) {
    throw new StripeServiceError("You don't have a billing profile yet — subscribe to a plan first.", "invalid_config");
  }

  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customer.stripe_customer_id,
    return_url: `${input.appUrl}/dashboard/billing`,
  });
  return { url: portalSession.url };
}

export function isStripeAvailable(): boolean {
  return !!getStripeEnvSafe();
}
