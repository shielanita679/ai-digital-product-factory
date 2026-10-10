import "server-only";

import { business } from "@/config/business";

/**
 * Delivers form submissions to the business. Supports Resend (email) or a
 * generic JSON webhook (helpdesk, Zapier, etc.). Returns false when neither
 * is configured so the caller can tell the customer to email instead.
 */
export async function deliverToSupport(subject: string, fields: Record<string, string>, replyTo: string): Promise<boolean> {
  const text = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  if (process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL && business.supportEmail) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL,
        to: [business.supportEmail],
        reply_to: replyTo,
        subject,
        text,
      }),
    });
    if (!res.ok) throw new Error(`Email delivery failed with status ${res.status}`);
    return true;
  }

  if (process.env.CONTACT_WEBHOOK_URL) {
    const res = await fetch(process.env.CONTACT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, replyTo, fields, submittedAt: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`Webhook delivery failed with status ${res.status}`);
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(`[dev] Form submission (no delivery configured): ${subject}\n${text}`);
    return true;
  }
  return false;
}
