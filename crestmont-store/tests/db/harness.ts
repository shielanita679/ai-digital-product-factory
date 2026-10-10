import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import mariadb from "mariadb";

import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/db/client-factory";
import { parseDatabaseUrl } from "@/lib/db/config";
import type { PaidSessionInput, PendingOrderItem } from "@/lib/orders/types";

/**
 * Database test harness.
 *
 * Runs ONLY against a disposable local MySQL/MariaDB server given in
 * TEST_DATABASE_URL (e.g. a Docker container). It refuses any non-local host,
 * so it can never touch the production Hostinger database. Each test file
 * gets a fresh, randomly named database with the real Prisma migrations
 * applied, dropped afterwards.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDatabase = Boolean(TEST_DATABASE_URL);

export async function createTestDatabase(): Promise<{ db: PrismaClient; drop: () => Promise<void> }> {
  const cfg = parseDatabaseUrl(TEST_DATABASE_URL);
  if (!cfg) throw new Error("TEST_DATABASE_URL is not a valid mysql:// URL");
  if (!["127.0.0.1", "localhost", "::1"].includes(cfg.host)) {
    throw new Error(`Refusing to run database tests against non-local host ${cfg.host}`);
  }
  const name = `crestmont_test_${randomBytes(5).toString("hex")}`;
  const admin = { host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, allowPublicKeyRetrieval: true };

  const conn = await mariadb.createConnection({ ...admin, multipleStatements: true });
  try {
    await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${name}\``);
    const dir = path.join(__dirname, "..", "..", "prisma", "migrations");
    for (const m of readdirSync(dir).filter((d) => /^\d+_/.test(d)).sort()) {
      await conn.query(readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
    }
  } finally {
    await conn.end();
  }

  const db = createPrismaClient({ ...cfg, database: name, connectionLimit: 12, allowPublicKeyRetrieval: true });
  return {
    db,
    drop: async () => {
      await db.$disconnect();
      const c = await mariadb.createConnection(admin);
      await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
      await c.end();
    },
  };
}

let counter = 0;
/** A unique, valid SKU per test so tests sharing a database never interfere. */
export const uniqueSku = (suffix = "BLK") => `CH-TEST${++counter}${randomBytes(2).toString("hex").toUpperCase()}-${suffix}`;

export const inAnHour = () => new Date(Date.now() + 3600_000);

export function item(sku: string, quantity: number, unitAmount = 2999, overrides: Partial<PendingOrderItem> = {}): PendingOrderItem {
  return { productId: "p-test", sku, productName: "Test Product", variantName: "Black", quantity, unitAmount, ...overrides };
}

export function paidSession(sessionId: string, orderId: string, subtotal: number, overrides: Partial<PaidSessionInput> = {}): PaidSessionInput {
  return {
    id: sessionId,
    orderId,
    paymentIntent: `pi_${sessionId.slice(3)}`,
    customerEmail: "Buyer@Example.test",
    customerName: "Test Buyer",
    shipping: { name: "Test Buyer", line1: "1 Test St", line2: "", city: "Testville", state: "MO", postalCode: "63105", country: "us" },
    currency: "usd",
    amountSubtotal: subtotal,
    amountShipping: 500,
    amountTax: 0,
    amountDiscount: 0,
    amountTotal: subtotal + 500,
    ...overrides,
  };
}
