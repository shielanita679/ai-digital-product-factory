import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * TEMPORARY diagnostic route (Phase 11 webhook stale-state investigation
 * only — see the route's own doc comment). These tests prove the security
 * properties that make it safe to deploy even temporarily: no caller can
 * ever supply a Stripe identifier, no mutation method is ever called, and
 * the same test-mode guard every other Stripe call site uses is honored.
 */

const getUser = vi.fn();
const fromEq = vi.fn();
const supabaseFrom = vi.fn(() => ({
  select: () => ({
    eq: fromEq,
  }),
}));
const createClient = vi.fn(async () => ({
  auth: { getUser },
  from: supabaseFrom,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const retrieveSubscription = vi.fn();
const stripeMutationMethodsCalled: string[] = [];
function makeFakeStripeClient() {
  // Deliberately does NOT implement any create/update/cancel/delete method —
  // if the route ever tried to call one, it would throw "not a function",
  // which is itself a strong structural assertion alongside the spy checks.
  return {
    subscriptions: {
      retrieve: (...args: unknown[]) => {
        stripeMutationMethodsCalled.push("retrieve"); // read, tracked separately from mutations for clarity
        return retrieveSubscription(...args);
      },
    },
  };
}

const getStripeClient = vi.fn(() => makeFakeStripeClient());
class StripeNotConfiguredError extends Error {}
class StripeLiveModeRejectedError extends Error {}
vi.mock("@/lib/stripe/stripe-client", () => ({ getStripeClient }));
vi.mock("@/lib/stripe/stripe-env", () => ({ StripeNotConfiguredError, StripeLiveModeRejectedError }));

const { GET } = await import("@/app/api/diagnostics/stripe-subscription/route");

beforeEach(() => {
  getUser.mockReset();
  fromEq.mockReset();
  supabaseFrom.mockClear();
  createClient.mockClear();
  retrieveSubscription.mockReset();
  getStripeClient.mockReset();
  getStripeClient.mockImplementation(() => makeFakeStripeClient());
  stripeMutationMethodsCalled.length = 0;
});

describe("GET /api/diagnostics/stripe-subscription — authentication", () => {
  it("rejects an unauthenticated request with 401, and never queries the DB or Stripe", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(supabaseFrom).not.toHaveBeenCalled();
    expect(getStripeClient).not.toHaveBeenCalled();
    expect(retrieveSubscription).not.toHaveBeenCalled();
  });
});

describe("GET /api/diagnostics/stripe-subscription — scoped to the caller's own subscription only", () => {
  it("derives user_id from the session and queries subscriptions scoped to exactly that user_id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a-id" } } });
    fromEq.mockReturnValue({ maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_own_a" }, error: null }) });
    retrieveSubscription.mockResolvedValue({
      status: "active",
      cancel_at_period_end: true,
      cancel_at: 1735000000,
      canceled_at: null,
      livemode: false,
      items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }] },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fromEq).toHaveBeenCalledWith("user_id", "user-a-id"); // scoped to the SESSION's own user_id — never anything else
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_own_a"); // the DB-derived id, never a caller-supplied one
    expect(body).toEqual({
      status: "active",
      cancel_at_period_end: true,
      cancel_at: 1735000000,
      canceled_at: null,
      current_period_start: 1700000000,
      current_period_end: 1702592000,
      livemode: false,
    });
  });

  it("returns a fixed, minimal field set — never the full Stripe Subscription object (no customer/payment fields leak through)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a-id" } } });
    fromEq.mockReturnValue({ maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_own_a" }, error: null }) });
    retrieveSubscription.mockResolvedValue({
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      livemode: false,
      customer: "cus_should_never_appear",
      latest_invoice: "in_should_never_appear",
      metadata: { user_id: "user-a-id" },
      items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000, price: { id: "price_should_never_appear" } }] },
    });

    const response = await GET();
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(["cancel_at", "cancel_at_period_end", "canceled_at", "current_period_end", "current_period_start", "livemode", "status"].sort());
    expect(JSON.stringify(body)).not.toContain("cus_should_never_appear");
    expect(JSON.stringify(body)).not.toContain("in_should_never_appear");
    expect(JSON.stringify(body)).not.toContain("price_should_never_appear");
  });

  it("returns 404 when the caller has no subscription mapping — never falls back to any other user's row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-with-no-sub" } } });
    fromEq.mockReturnValue({ maybeSingle: async () => ({ data: null, error: null }) });

    const response = await GET();

    expect(response.status).toBe(404);
    expect(getStripeClient).not.toHaveBeenCalled();
  });
});

describe("GET /api/diagnostics/stripe-subscription — no caller-controlled Stripe identifier can exist", () => {
  it("the handler accepts NO request parameter at all — structurally impossible to read a query string or body", () => {
    // GET is declared with zero parameters (see the route source) — this
    // test simply documents/enforces that invocation shape: calling it
    // exactly as Next.js would (no arguments) is the ONLY supported call,
    // so there is no argument position through which a caller could ever
    // inject a subscription/customer/user/price id.
    expect(GET.length).toBe(0);
  });

  it("even though the mocked DB lookup returns a specific id, that id — not any external input — is what's sent to Stripe", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a-id" } } });
    fromEq.mockReturnValue({ maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_trusted_db_value" }, error: null }) });
    retrieveSubscription.mockResolvedValue({
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      livemode: false,
      items: { data: [{}] },
    });

    await GET();

    expect(retrieveSubscription).toHaveBeenCalledTimes(1);
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_trusted_db_value");
  });
});

describe("GET /api/diagnostics/stripe-subscription — live-mode Stripe credentials rejected", () => {
  it("returns 400 and never calls Stripe when getStripeClient() rejects a live-mode key", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a-id" } } });
    fromEq.mockReturnValue({ maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_own_a" }, error: null }) });
    getStripeClient.mockImplementation(() => {
      throw new StripeLiveModeRejectedError("live-mode key rejected");
    });

    const response = await GET();

    expect(response.status).toBe(400);
    expect(retrieveSubscription).not.toHaveBeenCalled();
  });

  it("returns 400 when Stripe isn't configured at all (never treated as a 500/crash)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a-id" } } });
    fromEq.mockReturnValue({ maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_own_a" }, error: null }) });
    getStripeClient.mockImplementation(() => {
      throw new StripeNotConfiguredError("not configured");
    });

    const response = await GET();

    expect(response.status).toBe(400);
  });
});

describe("GET /api/diagnostics/stripe-subscription — no mutation method is ever called", () => {
  it("only stripe.subscriptions.retrieve is invoked — the fake client implements no create/update/cancel/delete method at all", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a-id" } } });
    fromEq.mockReturnValue({ maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_own_a" }, error: null }) });
    retrieveSubscription.mockResolvedValue({
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      livemode: false,
      items: { data: [{}] },
    });

    await GET();

    expect(stripeMutationMethodsCalled).toEqual(["retrieve"]); // exactly one call, and it's the read method
  });
});
