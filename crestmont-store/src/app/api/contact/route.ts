import { NextResponse } from "next/server";

import { business } from "@/config/business";
import { deliverToSupport } from "@/lib/deliver";
import { guardJsonPost, jsonError } from "@/lib/request-security";
import { contactSubjects } from "@/config/contact";
import { contactSchema, firstError } from "@/lib/validation";

export async function POST(request: Request) {
  const guard = await guardJsonPost(request, { bucket: "contact", limit: 5, windowMs: 10 * 60_000 });
  if ("response" in guard) return guard.response;

  const parsed = contactSchema.safeParse(guard.body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const data = parsed.data;

  // Honeypot filled: pretend success so bots get no signal.
  if (data.company) return NextResponse.json({ ok: true, message: "Thanks — your message has been sent." });

  try {
    const delivered = await deliverToSupport(
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
    if (!delivered) {
      return jsonError(
        business.supportEmail
          ? `Our contact form is temporarily unavailable. Please email us at ${business.supportEmail}.`
          : "Our contact form is temporarily unavailable. Please try again later.",
        503,
      );
    }
  } catch (err) {
    console.error("Contact form delivery failed", err);
    return jsonError("We couldn't send your message just now. Please try again in a few minutes.", 502);
  }

  const when = business.supportResponseTime ? ` We aim to reply ${business.supportResponseTime}.` : "";
  return NextResponse.json({ ok: true, message: `Thanks, ${data.name}. We've received your message and will reply to ${data.email}.${when}` });
}
