/**
 * Centralized rate-limit configuration — the single place these numbers
 * live. Must match the `operation` CHECK constraint in
 * supabase/migrations/20261010000000_add_admin_analytics_rate_limits_errors.sql
 * exactly.
 *
 * Enforced via the atomic check_rate_limit() Postgres function
 * (src/lib/rate-limit/rate-limiter.ts) — a fixed-window counter table,
 * chosen because it's sufficient at current scale and avoids standing up
 * an external service. FUTURE UPGRADE PATH: if traffic grows enough that a
 * single Postgres row per user/operation/window becomes a bottleneck, or
 * multi-region edge enforcement is needed, swap rate-limiter.ts's internals
 * for a Redis/Upstash sliding-window limiter — the enforceRateLimit(userId,
 * operation) call-site contract in every Server Action stays identical, so
 * no caller needs to change.
 */
export const RATE_LIMIT_OPERATION_VALUES = [
  "image_generation",
  "vectorization",
  "mockup_generation",
  "listing_generation",
  "package_generation",
  "stripe_checkout",
  "stripe_portal",
] as const;

export type RateLimitOperation = (typeof RATE_LIMIT_OPERATION_VALUES)[number];

export const RATE_LIMIT_CONFIG: Record<RateLimitOperation, { maxRequests: number; windowSeconds: number }> = {
  image_generation: { maxRequests: 20, windowSeconds: 60 * 60 },
  vectorization: { maxRequests: 30, windowSeconds: 60 * 60 },
  mockup_generation: { maxRequests: 20, windowSeconds: 60 * 60 },
  listing_generation: { maxRequests: 30, windowSeconds: 60 * 60 },
  package_generation: { maxRequests: 20, windowSeconds: 60 * 60 },
  stripe_checkout: { maxRequests: 10, windowSeconds: 60 * 60 },
  stripe_portal: { maxRequests: 10, windowSeconds: 60 * 60 },
};
