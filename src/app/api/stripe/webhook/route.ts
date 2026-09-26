import { NextResponse } from "next/server";

import { verifyWebhookSignature, processWebhookEvent, WebhookServiceError } from "@/lib/stripe/webhook-service";
import { StripeNotConfiguredError, StripeLiveModeRejectedError } from "@/lib/stripe/stripe-env";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ErrorReporter } from "@/lib/errors/error-reporter";

/**
 * Stripe webhook endpoint. Reads the RAW request body (req.text(), never
 * req.json() — Stripe's signature covers the exact bytes sent, and
 * re-serializing parsed JSON would not reproduce them byte-for-byte) and
 * verifies it before trusting anything in it. Every response path below
 * is deliberate:
 *   - 400 for a missing/invalid signature or unparseable payload — Stripe
 *     does not retry 4xx responses for signature failures, which is
 *     correct here (retrying won't fix a bad signature).
 *   - 200 for anything the webhook fully handled OR safely determined
 *     needs no action (duplicate event, unknown event type) — telling
 *     Stripe "stop retrying, this is done".
 *   - 500 only when processing genuinely failed after the signature was
 *     valid — this DOES ask Stripe to retry, which is correct: the event
 *     is real and still needs to be applied.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError || err instanceof StripeLiveModeRejectedError) {
      // Never a Stripe network call in either case — configuration itself
      // is unsafe/missing, so this request is rejected outright.
      return NextResponse.json({ error: "Billing is not configured." }, { status: 400 });
    }
    if (err instanceof WebhookServiceError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid webhook request." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const result = await processWebhookEvent(supabase, event);

  if (result.outcome === "failed") {
    ErrorReporter.captureMessage("Stripe webhook processing failed", {
      route: "api/stripe/webhook",
      metadata: { eventType: event.type, error: result.error },
    });
    return NextResponse.json({ error: result.error ?? "Webhook processing failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true, outcome: result.outcome });
}
