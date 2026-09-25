import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe/stripe-client";
import { StripeNotConfiguredError, StripeLiveModeRejectedError } from "@/lib/stripe/stripe-env";

/**
 * TEMPORARY READ-ONLY DIAGNOSTIC — Phase 11 webhook stale-state
 * investigation only. Delete this route once the investigation is
 * closed; it is not part of the permanent billing surface.
 *
 * Purpose: from an environment that CAN reach api.stripe.com (unlike the
 * sandbox this was developed in), report what Stripe's API currently
 * returns for the CALLING user's OWN subscription — nothing else.
 *
 * SECURITY, all enforced structurally, not just by convention:
 *   - No `request` parameter is even accepted by this handler — there is
 *     no code path by which a query string or request body could be read
 *     at all, so no caller-controlled subscription/customer/user/price
 *     id can exist here even in principle.
 *   - user_id comes exclusively from the Supabase session cookie via
 *     `supabase.auth.getUser()` (revalidated against the Auth server,
 *     never trusted from a client-supplied value).
 *   - stripe_subscription_id comes exclusively from OUR OWN `subscriptions`
 *     table, looked up by that session's user_id — both the explicit
 *     `.eq("user_id", user.id)` filter AND that table's own RLS SELECT
 *     policy (scoped to `auth.uid() = user_id`) independently restrict
 *     this to the caller's own row.
 *   - `getStripeClient()` is the same function every other Stripe call
 *     site in this app uses; it calls `getStripeEnv()` internally, which
 *     calls `assertTestModeSecretKey()` — a live-mode key is rejected
 *     before any Stripe network call is made, exactly as everywhere else.
 *   - Only `stripe.subscriptions.retrieve()` is called — a read. No
 *     create/update/cancel/delete method is called anywhere in this file.
 *   - The response is a fixed, minimal field allowlist — never the full
 *     Stripe Subscription object, never anything customer/payment-related.
 *   - GET only (the only exported handler) — any other HTTP method is
 *     rejected by Next.js itself with 405 before this code runs.
 */
export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: mapping, error: dbError } = await supabase.from("subscriptions").select("stripe_subscription_id").eq("user_id", user.id).maybeSingle();
  if (dbError) {
    return NextResponse.json({ error: "Could not load your subscription mapping." }, { status: 500 });
  }
  if (!mapping?.stripe_subscription_id) {
    return NextResponse.json({ error: "No subscription found for this account." }, { status: 404 });
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "Billing is not configured." }, { status: 400 });
    }
    if (err instanceof StripeLiveModeRejectedError) {
      return NextResponse.json({ error: "Live-mode Stripe credentials are rejected in this environment." }, { status: 400 });
    }
    throw err;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(mapping.stripe_subscription_id);
    const item = subscription.items.data[0];
    return NextResponse.json({
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      cancel_at: subscription.cancel_at,
      canceled_at: subscription.canceled_at,
      current_period_start: item?.current_period_start ?? null,
      current_period_end: item?.current_period_end ?? null,
      livemode: subscription.livemode,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Stripe request failed." }, { status: 502 });
  }
}
