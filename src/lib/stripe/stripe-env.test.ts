import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  assertTestModeSecretKey,
  assertTestModePublishableKey,
  getStripeEnv,
  getStripeEnvSafe,
  isStripeConfigured,
  StripeNotConfiguredError,
  StripeLiveModeRejectedError,
} from "@/lib/stripe/stripe-env";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("assertTestModeSecretKey — the Phase 11 test-mode safety guard", () => {
  it("accepts a well-formed test secret key", () => {
    expect(() => assertTestModeSecretKey("sk_test_abc123")).not.toThrow();
  });

  it("accepts a restricted test key (rk_test_)", () => {
    expect(() => assertTestModeSecretKey("rk_test_abc123")).not.toThrow();
  });

  it("rejects a live secret key", () => {
    expect(() => assertTestModeSecretKey("sk_live_abc123")).toThrow(StripeLiveModeRejectedError);
  });

  it("rejects a live restricted key", () => {
    expect(() => assertTestModeSecretKey("rk_live_abc123")).toThrow(StripeLiveModeRejectedError);
  });

  it("rejects a malformed key with no recognized prefix", () => {
    expect(() => assertTestModeSecretKey("not-a-real-key")).toThrow(StripeLiveModeRejectedError);
  });

  it("rejects an empty string", () => {
    expect(() => assertTestModeSecretKey("")).toThrow(StripeLiveModeRejectedError);
  });

  it("never includes the actual key value in the thrown error message", () => {
    const secret = "sk_live_super-secret-value-12345";
    try {
      assertTestModeSecretKey(secret);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
      expect((err as Error).message).not.toContain("super-secret-value-12345");
    }
  });
});

describe("assertTestModePublishableKey", () => {
  it("accepts pk_test_", () => {
    expect(() => assertTestModePublishableKey("pk_test_abc")).not.toThrow();
  });
  it("rejects pk_live_", () => {
    expect(() => assertTestModePublishableKey("pk_live_abc")).toThrow(StripeLiveModeRejectedError);
  });
  it("rejects malformed", () => {
    expect(() => assertTestModePublishableKey("garbage")).toThrow(StripeLiveModeRejectedError);
  });
});

describe("getStripeEnv / getStripeEnvSafe / isStripeConfigured", () => {
  it("throws StripeNotConfiguredError when STRIPE_SECRET_KEY is unset", () => {
    expect(() => getStripeEnv()).toThrow(StripeNotConfiguredError);
    expect(isStripeConfigured()).toBe(false);
    expect(getStripeEnvSafe()).toBeNull();
  });

  it("throws StripeLiveModeRejectedError when a live key is configured — NEVER silently proceeds", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_dangerous";
    expect(() => getStripeEnv()).toThrow(StripeLiveModeRejectedError);
    expect(getStripeEnvSafe()).toBeNull();
    // isStripeConfigured() only checks presence, not safety — a live key
    // still counts as "configured" for UI branching, but every actual
    // Stripe call goes through getStripeEnv()/getStripeClient(), which
    // WILL reject it. This is why isStripeConfigured() alone is never
    // sufficient to authorize a real Stripe call anywhere in this codebase.
    expect(isStripeConfigured()).toBe(true);
  });

  it("returns a safe test-mode env when correctly configured", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_xyz";
    const env = getStripeEnv();
    expect(env.secretKey).toBe("sk_test_abc123");
    expect(env.webhookSecret).toBe("whsec_test_xyz");
    expect(getStripeEnvSafe()).toEqual(env);
    expect(isStripeConfigured()).toBe(true);
  });

  it("webhookSecret is null (not throwing) when unset even with a valid test secret key", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc123";
    const env = getStripeEnv();
    expect(env.webhookSecret).toBeNull();
  });

  it("handles a malformed configured key the same as a live key — rejects, never proceeds", () => {
    process.env.STRIPE_SECRET_KEY = "totally-malformed";
    expect(() => getStripeEnv()).toThrow(StripeLiveModeRejectedError);
    expect(getStripeEnvSafe()).toBeNull();
  });
});
