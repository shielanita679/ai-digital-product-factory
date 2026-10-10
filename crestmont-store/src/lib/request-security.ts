import "server-only";

import { NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * CSRF defence for JSON endpoints: browsers always send Origin on
 * cross-site POSTs, so the request must originate from this site.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(message: string, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: extraHeaders });
}

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Shared guard for public POST endpoints: origin check, JSON content type,
 * body-size cap, and per-IP rate limit. Returns the parsed body or a
 * ready-to-send error response.
 */
export async function guardJsonPost(
  request: Request,
  opts: { bucket: string; limit: number; windowMs: number },
): Promise<{ body: unknown } | { response: NextResponse }> {
  if (!isSameOrigin(request)) return { response: jsonError("Invalid request origin.", 403) };
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { response: jsonError("Unsupported content type.", 415) };
  }
  const limited = await rateLimit(`${opts.bucket}:${clientIp(request)}`, opts.limit, opts.windowMs);
  if (!limited.ok) {
    return {
      response: jsonError("Too many requests. Please wait a moment and try again.", 429, {
        "Retry-After": String(limited.retryAfterSeconds),
      }),
    };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { response: jsonError("Request is too large.", 413) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { response: jsonError("Malformed request.", 400) };
  }
}
