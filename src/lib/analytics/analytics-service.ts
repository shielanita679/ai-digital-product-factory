import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ANALYTICS_FORBIDDEN_METADATA_KEYS, ANALYTICS_METADATA_MAX_CHARS, isAnalyticsEventName, type AnalyticsEventName } from "@/config/analytics-events";
import { ErrorReporter } from "@/lib/errors/error-reporter";
import type { Json } from "@/types/supabase";

export type TrackEventInput = {
  eventName: AnalyticsEventName;
  userId: string;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
};

function containsForbiddenKey(value: unknown, depth = 0): boolean {
  if (depth > 5 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsForbiddenKey(item, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(
    ([key, val]) => (ANALYTICS_FORBIDDEN_METADATA_KEYS as readonly string[]).includes(key.toLowerCase()) || containsForbiddenKey(val, depth + 1),
  );
}

/**
 * The ONLY way analytics events are ever written in this app — never a
 * direct insert from a Server Action or component (analytics_events has
 * zero RLS policies for authenticated/anon; only a service-role client can
 * write to it, and this function is the sole caller of that client for
 * this table). Validates the event name against the fixed catalog and
 * rejects malformed/oversized/sensitive metadata BEFORE it ever reaches
 * the database — the migration's own CHECK constraints are defense in
 * depth, not the only guard. Never throws: a tracking failure must never
 * break the caller's real operation, so every failure is reported via
 * ErrorReporter and swallowed here.
 */
async function track(input: TrackEventInput): Promise<void> {
  try {
    if (!isAnalyticsEventName(input.eventName)) {
      throw new Error(`Unknown analytics event: ${String(input.eventName)}`);
    }
    if (!input.userId) {
      throw new Error("Analytics event requires a user id");
    }
    const metadata = input.metadata ?? {};
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      throw new Error("Analytics metadata must be a plain object");
    }
    if (containsForbiddenKey(metadata)) {
      throw new Error("Analytics metadata contains a forbidden key");
    }
    if (JSON.stringify(metadata).length > ANALYTICS_METADATA_MAX_CHARS) {
      throw new Error("Analytics metadata exceeds size limit");
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("analytics_events").insert({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      event_name: input.eventName,
      metadata: metadata as unknown as Json,
    });
    if (error) {
      throw new Error(`analytics insert failed: ${error.message}`);
    }
  } catch (error) {
    ErrorReporter.captureException(error, {
      route: "AnalyticsService.track",
      userId: input.userId,
      metadata: { eventName: input.eventName },
    });
  }
}

export const AnalyticsService = { track };
