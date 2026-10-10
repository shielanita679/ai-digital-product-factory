import type { PrismaClient } from "@/generated/prisma/client";

/** Tables the application requires. */
export const EXPECTED_TABLES = ["inventory", "inventory_movements", "order_items", "orders", "shipments", "stripe_events"] as const;

export type DatabaseHealth = {
  ok: boolean;
  serverVersion: string;
  migrations: { name: string; finished: boolean }[];
  missingTables: string[];
  tables: { name: string; rows: number; checkConstraints: number; indexes: number }[];
};

/**
 * Read-only schema/connectivity report. Returns structure and row COUNTS
 * only — never row contents or connection details.
 */
export async function getDatabaseHealth(db: PrismaClient): Promise<DatabaseHealth> {
  const num = (v: unknown) => Number(v ?? 0);
  const [version] = await db.$queryRaw<{ v: string }[]>`SELECT VERSION() AS v`;
  const tables = await db.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()`;
  const checks = await db.$queryRaw<{ name: string; n: bigint }[]>`
    SELECT table_name AS name, COUNT(*) AS n FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE() AND constraint_type = 'CHECK' GROUP BY table_name`;
  const indexes = await db.$queryRaw<{ name: string; n: bigint }[]>`
    SELECT table_name AS name, COUNT(DISTINCT index_name) AS n FROM information_schema.statistics
     WHERE table_schema = DATABASE() GROUP BY table_name`;
  const migrations = await db.$queryRaw<{ name: string; finished: number | bigint }[]>`
    SELECT migration_name AS name, (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finished
      FROM _prisma_migrations ORDER BY started_at`;

  const present = new Set(tables.map((t) => t.name));
  const missingTables = EXPECTED_TABLES.filter((t) => !present.has(t));
  const report: DatabaseHealth["tables"] = [];
  for (const name of EXPECTED_TABLES.filter((t) => present.has(t))) {
    // Table names come from the fixed EXPECTED_TABLES list, never from input.
    const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM \`${name}\``);
    report.push({
      name,
      rows: num(row?.n),
      checkConstraints: num(checks.find((c) => c.name === name)?.n),
      indexes: num(indexes.find((i) => i.name === name)?.n),
    });
  }
  const migrationList = migrations.map((m) => ({ name: m.name, finished: num(m.finished) === 1 }));
  return {
    ok: missingTables.length === 0 && migrationList.length > 0 && migrationList.every((m) => m.finished),
    serverVersion: version?.v ?? "unknown",
    migrations: migrationList,
    missingTables,
    tables: report,
  };
}
