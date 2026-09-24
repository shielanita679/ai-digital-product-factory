"use server";

import { requireUser } from "@/lib/supabase/current-user";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createCheckoutSession, createBillingPortalSession, StripeServiceError } from "@/lib/stripe/stripe-service";
import { createCheckoutSessionSchema } from "@/lib/validations/billing";
import { siteConfig } from "@/config/site";
import type { ActionResult } from "@/app/actions/projects";

function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

/**
 * Server-authoritative Checkout — the browser sends only `planId` (a safe
 * internal intent, e.g. "starter"). Everything else (Price ID, Stripe
 * Customer, success/cancel URLs) is resolved server-side; see
 * StripeService.createCheckoutSession's own doc comment.
 */
export async function createCheckoutSessionAction(input: unknown): Promise<ActionResult<{ url: string }>> {
  const parsed = createCheckoutSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid plan.") };

  const { user } = await requireUser();
  if (!user.email) return { ok: false, error: "Your account has no email on file." };

  try {
    const serviceRole = createServiceRoleClient();
    const result = await createCheckoutSession(serviceRole, {
      userId: user.id,
      email: user.email,
      planId: parsed.data.planId,
      appUrl: siteConfig.url,
    });
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof StripeServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not start checkout. Please try again." };
  }
}

export async function createBillingPortalSessionAction(): Promise<ActionResult<{ url: string }>> {
  const { user } = await requireUser();

  try {
    const serviceRole = createServiceRoleClient();
    const result = await createBillingPortalSession(serviceRole, { userId: user.id, appUrl: siteConfig.url });
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof StripeServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not open the billing portal. Please try again." };
  }
}
