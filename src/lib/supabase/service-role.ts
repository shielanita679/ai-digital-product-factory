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
 * this codebase, every one of which calls
 * CreditService.applyCreditMutation()/grantCredits() or reads/writes
 * webhook-only tables:
 *   1. WebhookService, processing a Stripe event whose signature has
 *      already been independently verified (no user session exists in an
 *      API route handling a webhook — there's nothing else it COULD use).
 *   2. CreditService.ensureSignupCreditsGranted, called on behalf of the
 *      current authenticated user but requiring the service-role-only
 *      credit_ledger_apply() RPC.
 *   3. generation-billing.ts's startGenerationJobWithCredits, reserving/
 *      charging/refunding credits for the current authenticated user's
 *      own generation job. ALL THREE mutate credit_accounts/credit_ledger
 *      exclusively via credit_ledger_apply() (see that migration
 *      function's own security-fix comment for why the arbitrary-user_id
 *      grant path is never granted to the `authenticated` Postgres role —
 *      a prior draft's authenticated-callable variant of that RPC was
 *      found, in review, to let a user mint arbitrary credits, and was
 *      removed before the migration was ever applied).
 * Every other read/write in this app uses the caller's own RLS-scoped
 * client (src/lib/supabase/server.ts) precisely so RLS remains the real
 * enforcement boundary — this client exists only where RLS structurally
 * cannot apply (webhooks) or must be deliberately bypassed by a
 * capability-restricted database function (all credit mutations). Never
 * import this from a Client Component; NEXT_PUBLIC_* never carries this
 * key.
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
