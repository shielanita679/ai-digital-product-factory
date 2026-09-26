import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import { getSupabaseEnv } from "@/lib/supabase/env";

export class SupabaseServiceRoleNotConfiguredError extends Error {
  constructor() {
    super("SUPABASE_SECRET_KEY (service-role) is not configured on the server. Set it in .env.local (see .env.example).");
    this.name = "SupabaseServiceRoleNotConfiguredError";
  }
}

/**
 * A service-role Supabase client — bypasses RLS entirely. Server-only,
 * and deliberately used from a small, enumerable set of call sites in
 * this codebase:
 *   1. WebhookService, processing a Stripe event whose signature has
 *      already been independently verified (no user session exists in an
 *      API route handling a webhook — there's nothing else it COULD use).
 *   2. CreditService.ensureSignupCreditsGranted, called on behalf of the
 *      current authenticated user but requiring the service-role-only
 *      credit_ledger_apply() RPC.
 *   3. generation-billing.ts's startGenerationJobWithCredits, reserving/
 *      charging/refunding credits for the current authenticated user's
 *      own generation job. These three mutate credit_accounts/credit_ledger
 *      exclusively via credit_ledger_apply() (see that migration
 *      function's own security-fix comment for why the arbitrary-user_id
 *      grant path is never granted to the `authenticated` Postgres role —
 *      a prior draft's authenticated-callable variant of that RPC was
 *      found, in review, to let a user mint arbitrary credits, and was
 *      removed before the migration was ever applied).
 *   4. (Phase 12) src/lib/admin/admin-service.ts's admin-only cross-user
 *      reads (users/projects/billing/system views) — invoked ONLY after
 *      src/lib/auth/admin.ts's requireAdmin()/assertAdmin() has already
 *      re-verified, server-side, that the current session's own
 *      profiles.role is 'admin'. This is a deliberate, narrow RLS bypass
 *      for a new category (admin cross-user reads), not covered by the
 *      "webhooks or capability-restricted function" framing above — see
 *      admin-service.ts's own doc comment.
 *   5. (Phase 12) src/lib/analytics/analytics-service.ts's track() — the
 *      sole writer of analytics_events (zero RLS policies for
 *      authenticated/anon, same pattern as stripe_webhook_events).
 *   6. (Phase 12) src/lib/rate-limit/rate-limiter.ts's enforceRateLimit()
 *      — the sole caller of the service-role-only check_rate_limit() RPC.
 *   7. (Phase 12) src/lib/errors/error-reporter.ts's default provider —
 *      the sole writer of application_errors (zero RLS policies).
 * Every other read/write in this app uses the caller's own RLS-scoped
 * client (src/lib/supabase/server.ts) precisely so RLS remains the real
 * enforcement boundary — this client exists only where RLS structurally
 * cannot apply (webhooks, admin cross-user reads) or must be deliberately
 * bypassed by a capability-restricted database function (credit
 * mutations, rate-limit counters). Never import this from a Client
 * Component; NEXT_PUBLIC_* never carries this key.
 */
export function createServiceRoleClient() {
  const { url } = getSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    throw new SupabaseServiceRoleNotConfiguredError();
  }
  return createSupabaseClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
