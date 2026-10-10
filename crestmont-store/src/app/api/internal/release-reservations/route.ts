import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { isOrderDatabaseEnabled } from "@/lib/db/config";
import { releaseExpiredReservations } from "@/lib/orders/repository";

/**
 * Safety-net job: releases stock held by abandoned checkouts whose Stripe
 * expiry webhook never arrived. Call from a Hostinger cron job every 10–15
 * minutes (docs/HOSTINGER_SETUP.md):
 *
 *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/internal/release-reservations
 *
 * Requires CRON_SECRET (a long random value). Without it the endpoint is disabled.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isOrderDatabaseEnabled()) return NextResponse.json({ error: "Order database not enabled" }, { status: 503 });
  try {
    const released = await releaseExpiredReservations();
    return NextResponse.json({ released });
  } catch (err) {
    console.error("Releasing expired reservations failed", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
