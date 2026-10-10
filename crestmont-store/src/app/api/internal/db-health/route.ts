import { NextResponse } from "next/server";

import { isOrderDatabaseEnabled } from "@/lib/db/config";
import { getDatabaseHealth } from "@/lib/db/health";
import { getDatabase } from "@/lib/db/prisma";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";

/**
 * Read-only database health check for operators (CRON_SECRET bearer token).
 * Reports schema structure and row counts only.
 */
export async function POST(request: Request) {
  if (!isInternalRequestAuthorized(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = isOrderDatabaseEnabled() ? getDatabase() : null;
  if (!db) return NextResponse.json({ ok: false, error: "Order database not enabled" }, { status: 503 });
  try {
    const health = await getDatabaseHealth(db);
    return NextResponse.json(health, { status: health.ok ? 200 : 500 });
  } catch (err) {
    console.error("Database health check failed", err);
    return NextResponse.json({ ok: false, error: "Database unreachable" }, { status: 503 });
  }
}
