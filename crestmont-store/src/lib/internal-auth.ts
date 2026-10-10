import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Bearer-token check for internal operational endpoints (cron jobs, health
 * checks). Uses CRON_SECRET; disabled entirely unless it is set (32+ chars).
 */
export function isInternalRequestAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
