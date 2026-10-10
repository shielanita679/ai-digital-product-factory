import { NextResponse } from "next/server";

import { publicSupportSchedule } from "@/config/business";
import { contactSubjects } from "@/config/contact";
import { deliverToSupport, isContactDeliveryConfigured, unavailableMessage } from "@/lib/deliver";
import { guardJsonPost, jsonError } from "@/lib/request-security";
import { contactSchema, firstError } from "@/lib/validation";

export async function POST(request: Request) {
  const guard = await guardJsonPost(request, { bucket: "contact", limit: 5, windowMs: 10 * 60_000 });
  if ("response" in guard) return guard.response;

  // Refuse explicitly rather than accept a message that can't be delivered.
  if (!isContactDeliveryConfigured()) return jsonError(unavailableMessage(), 503);

  const parsed = contactSchema.safeParse(guard.body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const data = parsed.data;

  // Honeypot filled: pretend success so bots get no signal.
  if (data.company) return NextResponse.json({ ok: true, message: "Thanks — your message has been sent." });

  try {
    await deliverToSupport(
      `[Contact] ${contactSubjects[data.subject]}${data.orderNumber ? ` — order ${data.orderNumber}` : ""}`,
      {
        Name: data.name,
        Email: data.email,
        "Order number": data.orderNumber || "—",
        Subject: contactSubjects[data.subject],
        Message: data.message,
      },
      data.email,
    );
  } catch (err) {
    console.error("Contact form delivery failed", err);
    return jsonError("We couldn't send your message just now, and it has not been delivered. Please try again in a few minutes.", 502);
  }

  const schedule = publicSupportSchedule();
  const when = schedule ? ` We aim to respond ${schedule.responseTime}.` : "";
  return NextResponse.json({ ok: true, message: `Thanks, ${data.name}. We've received your message and will reply to ${data.email}.${when}` });
}
