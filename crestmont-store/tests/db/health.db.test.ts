import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseHealth } from "@/lib/db/health";

import { createTestDatabase, hasTestDatabase } from "./harness";

describe.skipIf(!hasTestDatabase)("database health report", () => {
  let db: PrismaClient;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    ({ db, drop } = await createTestDatabase());
  }, 60_000);
  afterAll(async () => drop?.());

  it("sees every table and the hand-written CHECK constraints", async () => {
    // The harness applies migration SQL directly, so record it the way `prisma migrate deploy` would.
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS _prisma_migrations (id VARCHAR(36) PRIMARY KEY, checksum VARCHAR(64), finished_at DATETIME(3) NULL, migration_name VARCHAR(255), logs TEXT, rolled_back_at DATETIME(3) NULL, started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), applied_steps_count INT NOT NULL DEFAULT 0)`);
    await db.$executeRawUnsafe(`INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ('t1', 'x', CURRENT_TIMESTAMP(3), '20261011000000_init', 1)`);
    const h = await getDatabaseHealth(db);
    expect(h.ok).toBe(true);
    expect(h.missingTables).toEqual([]);
    const inv = h.tables.find((t) => t.name === "inventory")!;
    expect(inv.checkConstraints).toBeGreaterThanOrEqual(4);
    expect(h.tables.find((t) => t.name === "orders")!.checkConstraints).toBeGreaterThanOrEqual(7);
    expect(JSON.stringify(h)).not.toMatch(/password|@/i);
  });
});
