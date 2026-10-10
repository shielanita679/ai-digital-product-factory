import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

import { createPrismaClient } from "./client-factory";
import { readDatabaseConfig } from "./config";

/**
 * The production database client. The ONLY module that turns DATABASE_URL
 * into a connection. "server-only" makes bundling it into browser code fail
 * the build, so database credentials can never reach a client bundle.
 *
 * Returns null until DATABASE_URL is configured.
 */
const globalForPrisma = globalThis as unknown as { crestmontPrisma?: PrismaClient };

export function getDatabase(): PrismaClient | null {
  if (typeof window !== "undefined") throw new Error("The database client must never run in the browser.");
  if (globalForPrisma.crestmontPrisma) return globalForPrisma.crestmontPrisma;
  const config = readDatabaseConfig();
  if (!config) return null;
  // Reused across hot reloads in development and across requests in production.
  globalForPrisma.crestmontPrisma = createPrismaClient(config);
  return globalForPrisma.crestmontPrisma;
}
