import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/types/supabase";

/**
 * Centralized, safe error-reporting abstraction. No external monitoring
 * provider is configured (no Sentry account was created for this phase,
 * per instruction) — the default provider logs to the server console AND
 * best-effort persists a redacted, size-capped row to
 * `application_errors` (readable only via the admin System view). A
 * future Sentry (or similar) provider can be added later by giving it the
 * same two-function shape below and swapping the implementation — no
 * caller (Server Actions, services, error boundaries) needs to change.
 */

const FORBIDDEN_KEY_SUBSTRINGS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "stripe-signature",
  "stripe_signature",
  "apikey",
  "api_key",
  "access_token",
  "refresh_token",
  "service_role",
  "service-role",
];

const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;

function isForbiddenKey(key: string): boolean {
  const lower = key.toLowerCase();
  return FORBIDDEN_KEY_SUBSTRINGS.some((needle) => lower.includes(needle));
}

/**
 * Recursively strips denylisted keys and truncates large values/arrays so
 * a reported context can never carry a secret or a huge payload. Exported
 * for direct unit testing.
 */
export function redact(value: unknown, depth = 0): Json {
  if (depth >= MAX_DEPTH) {
    return "[TRUNCATED]";
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isForbiddenKey(key) ? "[REDACTED]" : redact(val, depth + 1);
    }
    return out;
  }
  // Functions, symbols, bigints, etc. — never useful in a log, never risk serializing them.
  return String(value).slice(0, MAX_STRING_LENGTH);
}

export type ErrorContext = {
  route?: string;
  userId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
};

function serializeMessage(input: unknown): string {
  const raw = input instanceof Error ? `${input.name}: ${input.message}` : String(input);
  return raw.length > MAX_STRING_LENGTH ? `${raw.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]` : raw;
}

async function persist(level: "exception" | "message", message: string, context: ErrorContext): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase.from("application_errors").insert({
      level,
      message,
      context: redact(context.metadata ?? {}),
      route: context.route ?? null,
      user_id: context.userId ?? null,
    });
  } catch {
    // A monitoring-provider failure must NEVER crash the primary operation
    // that triggered this report — the console line above already ran, and
    // this is best-effort persistence on top of it, nothing more.
  }
}

function captureException(error: unknown, context: ErrorContext = {}): void {
  const message = serializeMessage(error);
  console.error(`[ErrorReporter]${context.route ? ` [${context.route}]` : ""}`, message, redact(context.metadata ?? {}));
  void persist("exception", message, context);
}

function captureMessage(message: string, context: ErrorContext = {}): void {
  const safeMessage = message.length > MAX_STRING_LENGTH ? `${message.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]` : message;
  console.warn(`[ErrorReporter]${context.route ? ` [${context.route}]` : ""}`, safeMessage, redact(context.metadata ?? {}));
  void persist("message", safeMessage, context);
}

export const ErrorReporter = { captureException, captureMessage };
