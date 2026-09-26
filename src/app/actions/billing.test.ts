import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Thin Server Action layer over StripeService — asserts the action never
 * trusts anything from the browser beyond `planId`, always resolves the
 * user server-side via requireUser(), and always uses the service-role
 * client (never the anon/session client) to reach StripeService. ZERO
 * Stripe network calls: createCheckoutSession/createBillingPortalSession
 * are fully mocked below.
 */

const requireUser = vi.fn(async () => ({
  supabase: {},
  user: { id: "11111111-1111-1111-1111-111111111111", email: "a@example.com" as string | undefined },
}));
vi.mock("@/lib/supabase/current-user", () => ({ requireUser }));

const createServiceRoleClient = vi.fn(() => ({ __serviceRole: true }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient }));

const createCheckoutSession = vi.fn();
const createBillingPortalSession = vi.fn();
class StripeServiceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}
vi.mock("@/lib/stripe/stripe-service", () => ({
  createCheckoutSession,
  createBillingPortalSession,
  StripeServiceError,
}));

const enforceRateLimit = vi.fn(async () => undefined);
class RateLimitError extends Error {
  code = "rate_limited" as const;
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Too many requests — try again in ${retryAfterSeconds}s.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
vi.mock("@/lib/rate-limit/rate-limiter", () => ({ enforceRateLimit, RateLimitError }));

const { createCheckoutSessionAction, createBillingPortalSessionAction } = await import("@/app/actions/billing");

beforeEach(() => {
  requireUser.mockClear();
  createServiceRoleClient.mockClear();
  createCheckoutSession.mockReset();
  createBillingPortalSession.mockReset();
  enforceRateLimit.mockReset().mockResolvedValue(undefined);
});

describe("createCheckoutSessionAction", () => {
  it("rejects an invalid planId before ever calling StripeService", async () => {
    const result = await createCheckoutSessionAction({ planId: "not-a-real-plan" });
    expect(result.ok).toBe(false);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("resolves the user server-side and passes only safe fields to StripeService — never trusts a browser-supplied userId/email", async () => {
    createCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const result = await createCheckoutSessionAction({ planId: "starter", userId: "attacker-controlled", email: "attacker@evil.com" });

    expect(result).toEqual({ ok: true, data: { url: "https://checkout.stripe.com/test" } });
    expect(requireUser).toHaveBeenCalled();
    expect(createServiceRoleClient).toHaveBeenCalled();
    expect(createCheckoutSession).toHaveBeenCalledWith(
      { __serviceRole: true },
      expect.objectContaining({ userId: "11111111-1111-1111-1111-111111111111", email: "a@example.com", planId: "starter" }),
    );
  });

  it("surfaces a StripeServiceError's message to the caller", async () => {
    createCheckoutSession.mockRejectedValue(new StripeServiceError("Price not configured for this plan.", "price_not_configured"));
    const result = await createCheckoutSessionAction({ planId: "starter" });
    expect(result).toEqual({ ok: false, error: "Price not configured for this plan." });
  });

  it("returns a generic error (never leaks internals) for an unexpected throw", async () => {
    createCheckoutSession.mockRejectedValue(new Error("connection reset"));
    const result = await createCheckoutSessionAction({ planId: "starter" });
    expect(result).toEqual({ ok: false, error: "Could not start checkout. Please try again." });
  });

  it("blocks when the authenticated user has no email on file", async () => {
    requireUser.mockResolvedValueOnce({ supabase: {}, user: { id: "11111111-1111-1111-1111-111111111111", email: undefined } });
    const result = await createCheckoutSessionAction({ planId: "starter" });
    expect(result.ok).toBe(false);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("enforces the rate limit before ever calling StripeService, and a RateLimitError surfaces its friendly message", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(30));
    const result = await createCheckoutSessionAction({ planId: "starter" });
    expect(result).toEqual({ ok: false, error: "Too many requests — try again in 30s." });
    expect(enforceRateLimit).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", "stripe_checkout");
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});

describe("createBillingPortalSessionAction", () => {
  it("resolves the user server-side and passes only the server-derived userId — never a browser-supplied customer id", async () => {
    createBillingPortalSession.mockResolvedValue({ url: "https://billing.stripe.com/test" });
    const result = await createBillingPortalSessionAction();

    expect(result).toEqual({ ok: true, data: { url: "https://billing.stripe.com/test" } });
    expect(createBillingPortalSession).toHaveBeenCalledWith({ __serviceRole: true }, expect.objectContaining({ userId: "11111111-1111-1111-1111-111111111111" }));
  });

  it("surfaces a StripeServiceError's message to the caller", async () => {
    createBillingPortalSession.mockRejectedValue(new StripeServiceError("No billing account found.", "invalid_config"));
    const result = await createBillingPortalSessionAction();
    expect(result).toEqual({ ok: false, error: "No billing account found." });
  });

  it("returns a generic error for an unexpected throw", async () => {
    createBillingPortalSession.mockRejectedValue(new Error("boom"));
    const result = await createBillingPortalSessionAction();
    expect(result).toEqual({ ok: false, error: "Could not open the billing portal. Please try again." });
  });

  it("enforces the rate limit before ever calling StripeService, and a RateLimitError surfaces its friendly message", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(15));
    const result = await createBillingPortalSessionAction();
    expect(result).toEqual({ ok: false, error: "Too many requests — try again in 15s." });
    expect(enforceRateLimit).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", "stripe_portal");
    expect(createBillingPortalSession).not.toHaveBeenCalled();
  });
});
