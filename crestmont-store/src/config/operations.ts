/**
 * Infrastructure decisions that are still open. Kept here so they are
 * visible in one place and reported by `npm run check:launch`.
 * See docs/ARCHITECTURE.md for the intended design.
 */
export const operations = {
  /**
   * Hosting provider. Unresolved; the app must stay portable between Vercel,
   * standard Node.js hosting and VPS/container deployment, so no
   * provider-specific dependencies are used.
   */
  hostingProvider: null as string | null,

  /**
   * Order/inventory database. Planned: a NEW, separate Supabase project for
   * CRESTMONT HOLDINGS (never the AI Digital Product Factory project).
   * Not built yet — false until orders and inventory are persisted.
   */
  orderDatabaseConfigured: false,

  /**
   * The current rate limiter (lib/rate-limit.ts) keeps counters in process
   * memory. It does NOT provide distributed protection on serverless or
   * multi-instance hosting and must be replaced with a shared store before
   * production deployment.
   */
  rateLimiter: "in_memory" as "in_memory" | "shared",
} as const;
