import "server-only";

import { business } from "@/config/business";

/**
 * Contact and order-status messages are delivered to the support inbox by
 * email through Resend (https://resend.com), called from the server only.
 *
 * Delivery is enabled only when all three exist:
 *   RESEND_API_KEY      server-side secret, never sent to the browser
 *   CONTACT_FROM_EMAIL  a sending address verified in Resend on the store's domain
 *   SUPPORT_EMAIL       the real support inbox that receives the message
 *
 * Without them, forms are shown as unavailable and the API refuses
 * submissions with an explicit error, so no message is ever accepted and
 * then silently dropped.
 */
export function isContactDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL && business.supportEmail);
}

export class DeliveryNotConfiguredError extends Error {}

/** Sends a submission to the support inbox. Throws if delivery is not configured or fails. */
export async function deliverToSupport(subject: string, fields: Record<string, string>, replyTo: string): Promise<void> {
  if (!isContactDeliveryConfigured()) throw new DeliveryNotConfiguredError("Contact delivery is not configured");

  const text = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

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
}

/** Customer-facing message when the form can't be used. */
export function unavailableMessage(): string {
  return business.supportEmail
    ? `Our online form isn't available right now, and your message has not been sent. Please email us at ${business.supportEmail}.`
    : "Our online form isn't available yet, and your message has not been sent. Please try again later.";
}
