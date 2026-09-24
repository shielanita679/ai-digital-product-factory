/**
 * Stripe configuration + the Phase 11 test-mode safety guard — the single
 * place that decides whether Stripe is configured at all, and whether the
 * configured secret key is safe to use. Mirrors src/lib/supabase/env.ts's
 * shape (readXxxEnv -> null | throw), but adds a requirement Supabase never
 * needed: Phase 11 explicitly forbids live-mode Stripe credentials for the
 * whole phase, so this module is the ONE gate every Stripe network call
 * must pass through first.
 *
 * Server-only. Never import this from a Client Component — nothing here is
 * NEXT_PUBLIC_*, and StripeConfigError messages are safe to render
 * server-side but this module itself must never reach the browser bundle.
 */

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Billing is not configured in this environment. Set STRIPE_SECRET_KEY in .env.local (see .env.example) to enable it.");
    this.name = "StripeNotConfiguredError";
  }
}

export class StripeLiveModeRejectedError extends Error {
  constructor(reason: string) {
    super(`Refused to use Stripe credentials that are not clearly TEST MODE: ${reason}. Phase 11 only ever runs against Stripe test mode.`);
    this.name = "StripeLiveModeRejectedError";
  }
}

/**
 * Stripe secret keys always start with a mode prefix: `sk_test_`/`rk_test_`
 * for test mode, `sk_live_`/`rk_live_` for live mode. Anything that doesn't
 * match one of the recognized test-mode prefixes is rejected outright —
 * including a live key, a malformed key, or a key in an unrecognized shape
 * this guard doesn't yet know how to classify as safe. Never logs the key
 * itself, even on rejection.
 */
export function assertTestModeSecretKey(secretKey: string): void {
  const trimmed = secretKey.trim();
  if (trimmed.startsWith("sk_live_") || trimmed.startsWith("rk_live_")) {
    throw new StripeLiveModeRejectedError("key has a live-mode prefix (sk_live_/rk_live_)");
  }
  if (!trimmed.startsWith("sk_test_") && !trimmed.startsWith("rk_test_")) {
    throw new StripeLiveModeRejectedError("key does not have a recognized test-mode prefix (sk_test_/rk_test_)");
  }
}

/** Same test/live-mode prefix convention applies to the publishable key (pk_test_/pk_live_), if one is ever configured. */
export function assertTestModePublishableKey(publishableKey: string): void {
  const trimmed = publishableKey.trim();
  if (trimmed.startsWith("pk_live_")) {
    throw new StripeLiveModeRejectedError("publishable key has a live-mode prefix (pk_live_)");
  }
  if (!trimmed.startsWith("pk_test_")) {
    throw new StripeLiveModeRejectedError("publishable key does not have a recognized test-mode prefix (pk_test_)");
  }
}

export type StripeEnv = {
  secretKey: string;
  webhookSecret: string | null;
};

function readStripeEnv(): StripeEnv | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
  };
}

/** True when STRIPE_SECRET_KEY is set at all — callers use this for "is billing configured" UI/branching before ever validating test-mode. */
export function isStripeConfigured(): boolean {
  return !!readStripeEnv();
}

/**
 * Throws StripeNotConfiguredError when unset, StripeLiveModeRejectedError
 * when set but not verifiably test-mode. A caller that gets a StripeEnv
 * back from this function has a guaranteed-test-mode secret key — no
 * further check is needed before constructing the SDK client.
 */
export function getStripeEnv(): StripeEnv {
  const env = readStripeEnv();
  if (!env) throw new StripeNotConfiguredError();
  assertTestModeSecretKey(env.secretKey);
  return env;
}

/** Returns null instead of throwing for any reason (unconfigured OR unsafe) — for code paths that must degrade gracefully rather than crash (the billing page, the header credit widget). */
export function getStripeEnvSafe(): StripeEnv | null {
  try {
    return getStripeEnv();
  } catch {
    return null;
  }
}
