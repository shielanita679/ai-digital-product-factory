/**
 * Centralized analytics event catalog — the single place the allowed event
 * names live. Must match the `event_name` CHECK constraint in
 * supabase/migrations/20261010000000_add_admin_analytics_rate_limits_errors.sql
 * exactly — adding an event here without a matching migration change (a
 * new, additive migration, never an edit to that one) will make
 * AnalyticsService.track() reject it at the DB layer.
 *
 * Every event is tracked through AnalyticsService.track() only — never a
 * direct insert from a Server Action or component. See that file's own
 * doc comment for what may/may not go in `metadata`.
 */
export const ANALYTICS_EVENT_VALUES = [
  "signup_completed",
  "onboarding_completed",
  "project_created",
  "generation_started",
  "generation_completed",
  "vectorization_completed",
  "bundle_created",
  "listing_generated",
  "package_created",
  "package_downloaded",
  "checkout_started",
  "subscription_activated",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_VALUES)[number];

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENT_VALUES as readonly string[]).includes(value);
}

/** Keys that must never appear in an analytics metadata payload, checked recursively. Mirrors the error-reporter redaction denylist. */
export const ANALYTICS_FORBIDDEN_METADATA_KEYS = [
  "password",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "stripe_signature",
  "service_role",
  "service_role_key",
] as const;

/** Matches the `analytics_events_metadata_size` CHECK constraint (char_length(metadata::text) < 2000) with headroom for the constraint's own comparison. */
export const ANALYTICS_METADATA_MAX_CHARS = 1900;
