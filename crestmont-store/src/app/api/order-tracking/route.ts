import { NextResponse } from "next/server";

import { business } from "@/config/business";
import { deliverToSupport } from "@/lib/deliver";
import { guardJsonPost, jsonError } from "@/lib/request-security";
import { firstError, trackingSchema } from "@/lib/validation";

/**
 * Order status requests. There is no self-serve order database connected
 * yet, so requests go to the support team, who reply by email. If you later
 * connect an order system, look the order up here and return its status.
 */
export async function POST(request: Request) {
  const guard = await guardJsonPost(request, { bucket: "tracking", limit: 5, windowMs: 10 * 60_000 });
  if ("response" in guard) return guard.response;

  const parsed = trackingSchema.safeParse(guard.body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { orderNumber, email, company } = parsed.data;
  if (company) return NextResponse.json({ ok: true, message: "Thanks — we've received your request." });

  try {
    const delivered = await deliverToSupport(`[Order status] ${orderNumber}`, { "Order number": orderNumber, Email: email }, email);
    if (!delivered) {
      return jsonError(
        business.supportEmail
          ? `Order status requests are temporarily unavailable. Please email ${business.supportEmail} with your order number.`
          : "Order status requests are temporarily unavailable. Please try again later.",
        503,
      );
    }
  } catch (err) {
    console.error("Order status delivery failed", err);
    return jsonError("We couldn't submit your request just now. Please try again in a few minutes.", 502);
  }

  const when = business.supportResponseTime ? ` ${business.supportResponseTime}` : "";
  return NextResponse.json({
    ok: true,
    message: `We've passed your request for order ${orderNumber} to our support team, and we'll email the current status to ${email}${when}. If your order has shipped, the tracking link is also in your shipping confirmation email.`,
  });
}
