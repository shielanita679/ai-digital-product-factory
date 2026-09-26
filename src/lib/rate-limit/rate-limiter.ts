import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { RATE_LIMIT_CONFIG, type RateLimitOperation } from "@/config/rate-limits";
import { ErrorReporter } from "@/lib/errors/error-reporter";

export class RateLimitError extends Error {
  code = "rate_limited" as const;
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Too many requests — try again in ${retryAfterSeconds}s.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type CheckRateLimitRow = { allowed: boolean; current_count: number; reset_at: string };

/**
 * Enforces a per-user, per-operation rate limit via the atomic
 * check_rate_limit() Postgres function (service-role only) — a single
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement, so two
 * concurrent calls for the same user/operation/window can never both slip
 * past the limit (no read-then-write race, and no reliance on in-process
 * memory, which would not be shared across stateless serverless
 * invocations). Throws RateLimitError when the limit is exceeded — never
 * enforced client-side; every call site is a server-side Server Action,
 * right after requireUser().
 *
 * Fails OPEN (never blocks the caller) on ANY infrastructure error — a
 * not-yet-applied Phase 12 migration, a misconfigured/missing service-role
 * key, a network error, or any other exception reaching this function —
 * mirrors BillingService's own tolerance for "migration not applied", so
 * a not-yet-applied migration (or any other infra hiccup) degrades to "no
 * rate limiting" rather than breaking every generation/checkout action in
 * the app. The ONLY way this function throws is the deliberate
 * RateLimitError below, once a real, successful rate-limit check reports
 * the caller is over their limit — every other failure mode is caught
 * here and swallowed (after being reported), never left to propagate.
 */
export async function enforceRateLimit(userId: string, operation: RateLimitOperation): Promise<void> {
  try {
    const config = RATE_LIMIT_CONFIG[operation];
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_user_id: userId,
      p_operation: operation,
      p_window_seconds: config.windowSeconds,
      p_max_requests: config.maxRequests,
    });

    if (error) {
      ErrorReporter.captureException(error, { route: "RateLimiter.enforceRateLimit", userId, metadata: { operation } });
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as CheckRateLimitRow | undefined;
    if (result && !result.allowed) {
      const resetAtMs = new Date(result.reset_at).getTime();
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
      throw new RateLimitError(retryAfterSeconds);
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    ErrorReporter.captureException(err, { route: "RateLimiter.enforceRateLimit", userId, metadata: { operation } });
  }
}
