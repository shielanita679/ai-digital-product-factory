import { NextResponse } from "next/server";

import { publicSupportSchedule } from "@/config/business";
import { isOrderDatabaseEnabled } from "@/lib/db/config";
import { deliverToSupport, isContactDeliveryConfigured, unavailableMessage } from "@/lib/deliver";
import { lookupOrder } from "@/lib/orders/repository";
import { rateLimit } from "@/lib/rate-limit";
import { guardJsonPost, jsonError } from "@/lib/request-security";
import { firstError, trackingSchema } from "@/lib/validation";

const NOT_FOUND = "We couldn't find an order matching those details. Check the order number in your confirmation email and use the email address you checked out with.";

/**
 * Order status.
 *  - Order database enabled: direct lookup requiring BOTH order number and
 *    checkout email. Any mismatch gets the same generic answer, so the
 *    response never reveals whether an order number exists. Attempts are
 *    rate-limited per IP and per order number.
 *  - Otherwise: the request is emailed to support (if delivery is set up).
 */
export async function POST(request: Request) {
  const guard = await guardJsonPost(request, { bucket: "tracking", limit: 5, windowMs: 10 * 60_000 });
  if ("response" in guard) return guard.response;

  const parsed = trackingSchema.safeParse(guard.body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { orderNumber, email, company } = parsed.data;
  if (company) return jsonError(NOT_FOUND, 404);

  if (isOrderDatabaseEnabled()) {
    const perOrder = await rateLimit(`tracking-order:${orderNumber.toUpperCase()}`, 10, 60 * 60_000);
    if (!perOrder.ok) return jsonError("Too many attempts for this order. Please try again later.", 429, { "Retry-After": String(perOrder.retryAfterSeconds) });
    try {
      const order = await lookupOrder(orderNumber, email);
      if (!order) return jsonError(NOT_FOUND, 404);
      return NextResponse.json({ ok: true, message: `Here's the current status of order ${order.orderNumber}.`, data: order });
    } catch (err) {
      console.error("Order lookup failed", err);
      return jsonError("We couldn't check your order just now. Please try again in a few minutes.", 502);
    }
  }

  if (!isContactDeliveryConfigured()) return jsonError(unavailableMessage(), 503);
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
