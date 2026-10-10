/**
 * Infrastructure decisions that are still open. Kept here so they are
 * visible in one place and reported by `npm run check:launch`.
 * See docs/ARCHITECTURE.md for the intended design.
 */
export const operations = {
  /**
   * Hosting: Hostinger (Node.js web app + Hostinger MySQL/MariaDB). Set to
   * the confirmed plan name once the account and plan are in place, e.g.
   * "Hostinger Business Web Hosting". The app has no provider-specific code
   * and remains portable.
   */
  hostingProvider: null as string | null,

  /**
   * Order/inventory database: the Hostinger MySQL database for CRESTMONT
   * HOLDINGS (Prisma, prisma/schema.prisma). Set to true only after
   * `prisma migrate deploy` has been run against it and DATABASE_URL is set
   * (docs/HOSTINGER_SETUP.md). While false, no code path touches a database.
   */
  orderDatabaseEnabled: false,

  /**
   * The rate limiter's store (lib/rate-limit.ts). "memory" keeps counters in
   * one Node.js process: it does NOT protect across several processes or
   * instances. Replace the store before relying on it in that setup.
   */
  rateLimiter: "memory" as "memory" | "shared",
} as const;
