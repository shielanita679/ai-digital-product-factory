import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import { getStripeClient } from "@/lib/stripe/stripe-client";
import { getStripeEnv } from "@/lib/stripe/stripe-env";
import { getPlanIdForPriceId, getMonthlyCreditsForPriceId } from "@/config/plans";
import { grantCredits } from "@/lib/credits/credit-service";

export type WebhookServiceErrorCode = "not_configured" | "invalid_signature" | "missing_signature";

export class WebhookServiceError extends Error {
  readonly code: WebhookServiceErrorCode;
  constructor(message: string, code: WebhookServiceErrorCode) {
    super(message);
    this.name = "WebhookServiceError";
    this.code = code;
  }
}

/**
 * Verifies the Stripe signature against the RAW request body (never the
 * parsed/re-serialized JSON — Stripe's signature covers the exact bytes
 * sent) and returns the resulting Event only on success. Never trusts an
 * unverified payload for anything, per Phase 11 spec section 9.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Stripe.Event {
  const env = getStripeEnv(); // throws StripeNotConfiguredError / StripeLiveModeRejectedError
  if (!env.webhookSecret) {
    throw new WebhookServiceError("STRIPE_WEBHOOK_SECRET is not configured on the server.", "not_configured");
  }
  if (!signatureHeader) {
    throw new WebhookServiceError("Missing Stripe-Signature header.", "missing_signature");
  }
  const stripe = getStripeClient();
  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, env.webhookSecret);
  } catch (err) {
    throw new WebhookServiceError(err instanceof Error ? err.message : "Invalid Stripe webhook signature.", "invalid_signature");
  }
}

type ProcessResult = { outcome: "processed" | "skipped_duplicate" | "failed"; error?: string };

/**
 * Resolves a Stripe subscription's price/customer/period into our
 * `subscriptions` row, upserted by user_id (from
 * subscription.metadata.user_id — set once, at Checkout creation time,
 * never trusted from anywhere else). Returns null when the subscription
 * can't be attributed to a known user (should not normally happen; only
 * if metadata was somehow lost) — callers must treat that as "nothing
 * safe to do" rather than guessing.
 *
 * Reads current_period_start/end from the FIRST subscription item — in
 * this Stripe API version (2026-08-26.dahlia) those fields live on each
 * SubscriptionItem, not on the top-level Subscription object (verified
 * against the installed SDK's own types, not guessed). Phase 11's plans
 * are single-price subscriptions, so item[0] is always the whole story.
 */
async function syncSubscriptionRecord(supabase: SupabaseClient<Database>, subscription: Stripe.Subscription): Promise<{ userId: string } | null> {
  const userId = subscription.metadata?.user_id;
  if (!userId) return null;

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  const planId = priceId ? getPlanIdForPriceId(priceId) : null;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      // Falls back to "free" only defensively (a price that isn't any
      // configured plan's Price ID shouldn't occur in normal operation) —
      // never left null, since plan_key is NOT NULL.
      plan_key: planId ?? "free",
      status: subscription.status,
      current_period_start: item ? new Date(item.current_period_start * 1000).toISOString() : null,
      current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Could not sync subscription: ${error.message}`);
  return { userId };
}

/**
 * SECURITY/CORRECTNESS (post-live-verification fix): the ONLY way any
 * `customer.subscription.*` webhook may update our `subscriptions` table.
 * Never persists the webhook payload's own embedded subscription object —
 * only ever the result of a FRESH `stripe.subscriptions.retrieve()` call,
 * keyed by the subscription id the (already signature-verified) event
 * refers to. Stripe does not guarantee webhook delivery order, so trusting
 * an event's own embedded snapshot lets an older, already-superseded
 * snapshot silently overwrite newer state if it happens to be *processed*
 * after a newer one — live-verified: two `customer.subscription.updated`
 * deliveries ~0.5s apart, both HTTP 200 and marked `processed`, ended with
 * `cancel_at_period_end` reverted from `true` back to `false`. Re-fetching
 * fresh on every delivery removes delivery order from the equation
 * entirely: whichever event triggers the fetch, the fetch itself always
 * returns whatever is CURRENTLY true on Stripe's side at that moment, so
 * the persisted state can never be staler than reality, regardless of
 * which event arrived first, last, or was redelivered.
 *
 * Never accepts a subscription id from anywhere but a verified webhook
 * event's own `data.object.id` — never from browser input, never
 * constructed from any other source.
 */
async function syncSubscriptionFresh(supabase: SupabaseClient<Database>, subscriptionId: string): Promise<{ userId: string } | null> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return syncSubscriptionRecord(supabase, subscription);
}

/**
 * Fallback for `customer.subscription.deleted` ONLY, and ONLY when a fresh
 * retrieve confirms the subscription is genuinely gone (Stripe returned
 * `resource_missing`) — most canceled subscriptions remain retrievable
 * (status simply flips to 'canceled'), so this path is rare in practice.
 * Deliberately minimal: matches an EXISTING local row purely by
 * `stripe_subscription_id` (a value that came from the verified event,
 * used here only to locate a row we already trust — never to fabricate
 * one) and marks it terminally canceled. If no local row matches, this is
 * a safe no-op — there is nothing to tombstone and nothing to resurrect.
 *
 * Why this can never resurrect a subscription a later, out-of-order
 * created/updated event might still report: every created/updated
 * delivery ALWAYS goes through syncSubscriptionFresh first (never this
 * function), which either (a) also gets `resource_missing` — because the
 * subscription really is gone — and therefore fails the webhook safely
 * without writing anything (see the Failure Behavior comment on
 * dispatchEvent's created/updated case), leaving this tombstone intact;
 * or (b) succeeds, in which case Stripe's own API is returning the
 * CURRENT true object, which — since the deletion already genuinely
 * happened — reports `status: "canceled"` itself, so the sync writes the
 * same terminal state again rather than reverting it. Either way, an
 * already-deleted subscription can never be written back to an active
 * status by a stale event.
 */
async function tombstoneDeletedSubscription(supabase: SupabaseClient<Database>, subscriptionId: string): Promise<void> {
  const { error } = await supabase.from("subscriptions").update({ status: "canceled", cancel_at_period_end: false }).eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error(`Could not tombstone deleted subscription: ${error.message}`);
}

/**
 * Monthly credit grant (Phase 11 spec sections 10/11) — the ONLY place
 * credits are granted for a paid subscription, gated on a verified
 * `invoice.paid` event, never on `checkout.session.completed`. Fetches
 * the subscription fresh from Stripe (rather than depending on
 * `subscriptions` already being synced locally) so this is correct
 * regardless of event delivery order — `invoice.paid` arriving before
 * `customer.subscription.created` is handled identically to arriving
 * after. Idempotency key is the invoice id: a webhook retry of the exact
 * same invoice can never grant credits twice.
 */
async function handleInvoicePaid(supabase: SupabaseClient<Database>, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
  if (!subscriptionId) return; // not a subscription invoice — Phase 11 has nothing to grant for

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const synced = await syncSubscriptionRecord(supabase, subscription);
  if (!synced) return;

  const priceId = subscription.items.data[0]?.price?.id;
  const credits = priceId ? getMonthlyCreditsForPriceId(priceId) : null;
  if (!credits || credits <= 0) return;

  await grantCredits(supabase, {
    userId: synced.userId,
    amount: credits,
    entryType: "subscription_grant",
    reason: `${credits} monthly credits`,
    idempotencyKey: `stripe_invoice:${invoice.id}`,
    referenceType: "stripe_invoice",
    referenceId: invoice.id,
  });
}

async function dispatchEvent(supabase: SupabaseClient<Database>, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      // State-sync convenience ONLY — never a credit grant (Phase 11 spec
      // section 10: "Checkout redirect is NOT proof of payment"). If the
      // session already has a subscription attached, sync it early so the
      // billing page can show "Active" without waiting on a second event;
      // the actual credit grant still only ever happens in
      // handleInvoicePaid.
      const session = event.data.object;
      const subRef = session.subscription;
      if (subRef) {
        const subscriptionId = typeof subRef === "string" ? subRef : subRef.id;
        await syncSubscriptionFresh(supabase, subscriptionId);
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      // SECURITY/CORRECTNESS (post-live-verification fix): never persist
      // the webhook payload's own embedded subscription snapshot — see
      // syncSubscriptionFresh's own comment for why. Stripe does not
      // guarantee delivery order, so two subscription.updated events
      // arriving out of order (live-verified: two events ~0.5s apart,
      // both HTTP 200, the LATER-processed one carried the OLDER data)
      // previously let a stale snapshot silently overwrite newer state
      // (e.g. a just-scheduled cancel_at_period_end=true reverted back to
      // false). Re-fetching fresh from Stripe on every delivery makes the
      // final persisted state independent of delivery order: whichever
      // event is processed, the fetch always returns whatever is
      // CURRENTLY true, so the write can never be staler than reality.
      await syncSubscriptionFresh(supabase, event.data.object.id);
      return;
    }
    case "customer.subscription.deleted": {
      // Same fetch-fresh approach as created/updated, EXCEPT: Stripe
      // subscriptions generally remain retrievable after cancellation
      // (status flips to 'canceled', the object isn't actually purged),
      // so the common case still goes through syncSubscriptionFresh. Only
      // when the retrieve fails with the specific "resource_missing"
      // error DURING a deleted event do we treat that as confirmed,
      // terminal deletion and fall back to a narrow tombstone write — see
      // tombstoneDeletedSubscription's own comment for why this can never
      // resurrect a subscription a later stale created/updated event
      // might re-report.
      const subscriptionId = event.data.object.id;
      try {
        await syncSubscriptionFresh(supabase, subscriptionId);
      } catch (err) {
        if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") {
          await tombstoneDeletedSubscription(supabase, subscriptionId);
          return;
        }
        throw err; // any other failure: never guess — fail the webhook safely, let Stripe retry.
      }
      return;
    }
    case "invoice.paid": {
      await handleInvoicePaid(supabase, event.data.object);
      return;
    }
    case "invoice.payment_failed": {
      // No credit action here, and deliberately no direct write either:
      // Stripe always pairs a failed invoice with a
      // `customer.subscription.updated` carrying the new status (e.g.
      // `past_due`), which is handled above and is the actual verified
      // source of truth for subscription state — this case exists only
      // to be explicitly acknowledged (not silently unhandled) rather
      // than duplicating that sync from less complete invoice data.
      // Already-granted credits are never clawed back (Phase 11 spec
      // section 12).
      return;
    }
    default:
      // Unknown/unsubscribed event type — acknowledge without action so
      // Stripe doesn't keep retrying something we deliberately don't handle.
      return;
  }
}

/**
 * Idempotent, at-most-once-fully-applied event processing (Phase 11 spec
 * sections 9/24). The stripe_webhook_events row's lifecycle is the whole
 * idempotency mechanism:
 *   - INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING claims the
 *     event; if no row was inserted, another delivery already claimed it.
 *   - A previously 'processed' duplicate is skipped outright — its
 *     handler never runs again, so a retried webhook can never double a
 *     credit grant or subscription sync.
 *   - A previously 'failed' event is RETRIED (never left permanently
 *     unprocessed just because one delivery attempt failed) — this is the
 *     "do not mark a failed webhook permanently processed before its
 *     transaction actually succeeds" requirement.
 *   - A row still at 'processing' (another delivery genuinely in flight,
 *     or a crashed attempt that never updated its own status) is treated
 *     as in-progress and skipped for THIS delivery; Stripe's own retry
 *     schedule will redeliver later. Phase 11 has no separate reconciler
 *     for a truly stuck 'processing' row — a documented, deliberately
 *     simple limitation, not an oversight.
 */
export async function processWebhookEvent(supabase: SupabaseClient<Database>, event: Stripe.Event): Promise<ProcessResult> {
  const { data: inserted, error: insertError } = await supabase
    .from("stripe_webhook_events")
    .insert({ stripe_event_id: event.id, event_type: event.type, status: "processing" })
    .select()
    .maybeSingle();

  let shouldProcess = !!inserted;

  if (!inserted) {
    if (insertError && insertError.code !== "23505") {
      return { outcome: "failed", error: insertError.message };
    }
    const { data: existing } = await supabase.from("stripe_webhook_events").select("*").eq("stripe_event_id", event.id).single();
    if (!existing || existing.status === "processing") {
      return { outcome: "skipped_duplicate" };
    }
    if (existing.status === "processed") {
      return { outcome: "skipped_duplicate" };
    }
    // status === 'failed' -> retry: flip back to 'processing' and fall through to handling.
    await supabase.from("stripe_webhook_events").update({ status: "processing", error_message: null }).eq("stripe_event_id", event.id);
    shouldProcess = true;
  }

  if (!shouldProcess) {
    return { outcome: "skipped_duplicate" };
  }

  try {
    await dispatchEvent(supabase, event);
    await supabase.from("stripe_webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("stripe_event_id", event.id);
    return { outcome: "processed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown webhook processing error.";
    await supabase.from("stripe_webhook_events").update({ status: "failed", error_message: message }).eq("stripe_event_id", event.id);
    return { outcome: "failed", error: message };
  }
}
