import { NextResponse } from "next/server";

import { guardJsonPost, jsonError } from "@/lib/request-security";
import { firstError, newsletterSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const guard = await guardJsonPost(request, { bucket: "newsletter", limit: 5, windowMs: 10 * 60_000 });
  if ("response" in guard) return guard.response;

  const parsed = newsletterSchema.safeParse(guard.body);
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  if (parsed.data.company) return NextResponse.json({ ok: true });

  const webhook = process.env.NEWSLETTER_WEBHOOK_URL;
  if (!webhook) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[dev] Newsletter signup (no provider configured): ${parsed.data.email}`);
      return NextResponse.json({ ok: true, message: "Thanks — you're on the list." });
    }
    return jsonError("Email signups aren't open yet. Please check back soon.", 503);
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: parsed.data.email, source: "website", subscribedAt: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`Newsletter webhook returned ${res.status}`);
  } catch (err) {
    console.error("Newsletter signup failed", err);
    return jsonError("We couldn't complete your signup just now. Please try again later.", 502);
  }
  return NextResponse.json({ ok: true, message: "Thanks — you're on the list." });
}
