import { NextResponse } from "next/server";

import { publicSupportSchedule } from "@/config/business";
import { deliverToSupport, isContactDeliveryConfigured, unavailableMessage } from "@/lib/deliver";
import { guardJsonPost, jsonError } from "@/lib/request-security";
import { firstError, trackingSchema } from "@/lib/validation";

/**
 * Order status requests. No order database is connected yet, so requests go
 * to the support inbox and support replies by email. Once the order database
 * exists, look the order up here and return its status directly.
 */
export async function POST(request: Request) {
  const guard = await guardJsonPost(request, { bucket: "tracking", limit: 5, windowMs: 10 * 60_000 });
  if ("response" in guard) return guard.response;

  if (!isContactDeliveryConfigured()) return jsonError(unavailableMessage(), 503);

  const parsed = trackingSchema.safeParse(guard.body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { orderNumber, email, company } = parsed.data;
  if (company) return NextResponse.json({ ok: true, message: "Thanks — we've received your request." });

  try {
    await deliverToSupport(`[Order status] ${orderNumber}`, { "Order number": orderNumber, Email: email }, email);
  } catch (err) {
    console.error("Order status delivery failed", err);
    return jsonError("We couldn't submit your request just now, and it has not been sent. Please try again in a few minutes.", 502);
  }

  const schedule = publicSupportSchedule();
  const when = schedule ? ` We aim to respond ${schedule.responseTime}.` : "";
  return NextResponse.json({
    ok: true,
    message: `We've passed your request for order ${orderNumber} to our support team, who will email the current status to ${email}.${when} If your order has shipped, any tracking details are also in your shipping confirmation email.`,
  });
}
