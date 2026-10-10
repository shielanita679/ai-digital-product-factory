import { NextResponse } from "next/server";

import { isOrderDatabaseEnabled } from "@/lib/db/config";
import { isInternalRequestAuthorized } from "@/lib/internal-auth";
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
export async function POST(request: Request) {
  if (!isInternalRequestAuthorized(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isOrderDatabaseEnabled()) return NextResponse.json({ error: "Order database not enabled" }, { status: 503 });
  try {
    const released = await releaseExpiredReservations();
    return NextResponse.json({ released });
  } catch (err) {
    console.error("Releasing expired reservations failed", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
