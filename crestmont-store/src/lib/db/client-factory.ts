import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/generated/prisma/client";

import type { DatabaseConnectionConfig } from "./config";

/** Creates a Prisma client for a MySQL/MariaDB connection (via the official mariadb driver adapter). */
export function createPrismaClient(config: DatabaseConnectionConfig): PrismaClient {
  const adapter = new PrismaMariaDb({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit,
    ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
    allowPublicKeyRetrieval: config.allowPublicKeyRetrieval,
    timezone: "Z",
  });
  return new PrismaClient({ adapter });
}
