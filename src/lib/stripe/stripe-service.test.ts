import { describe, it, expect, vi, beforeEach } from "vitest";

/** ZERO Stripe network calls — every Stripe SDK method used by StripeService is mocked below. */
const customersCreate = vi.fn();
const checkoutSessionsCreate = vi.fn();
const billingPortalSessionsCreate = vi.fn();
vi.mock("@/lib/stripe/stripe-client", () => ({
  getStripeClient: () => ({
    customers: { create: customersCreate },
    checkout: { sessions: { create: checkoutSessionsCreate } },
    billingPortal: { sessions: { create: billingPortalSessionsCreate } },
  }),
}));

const { getOrCreateCustomerId, createCheckoutSession, createBillingPortalSession, StripeServiceError } = await import("@/lib/stripe/stripe-service");

type Row = Record<string, unknown>;

/** Scoped precisely to each function's real query shape (stripe_customers/subscriptions lookups by user_id). */
function makeCustomerLookupSupabase(existingCustomerId: string | null, existingSubscriptionStatus: string | null = null) {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === "stripe_customers") return { data: existingCustomerId ? { stripe_customer_id: existingCustomerId } : null, error: null };
              if (table === "subscriptions") return { data: existingSubscriptionStatus ? { status: existingSubscriptionStatus } : null, error: null };
              return { data: null, error: null };
            },
          }),
        }),
        insert: async (payload: Row) => {
          void payload;
          return { error: null };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

beforeEach(() => {
  customersCreate.mockReset();
  checkoutSessionsCreate.mockReset();
  billingPortalSessionsCreate.mockReset();
  delete process.env.STRIPE_STARTER_PRICE_ID;
});

describe("getOrCreateCustomerId", () => {
  it("reuses an existing canonical customer id without calling Stripe", async () => {
    const supabase = makeCustomerLookupSupabase("cus_existing");
    const id = await getOrCreateCustomerId(supabase, "u1", "a@example.com");
    expect(id).toBe("cus_existing");
    expect(customersCreate).not.toHaveBeenCalled();
  });

  it("creates a new Stripe Customer with only safe metadata (user_id) when none exists", async () => {
    const supabase = makeCustomerLookupSupabase(null);
    customersCreate.mockResolvedValue({ id: "cus_new" });
    const id = await getOrCreateCustomerId(supabase, "u1", "a@example.com");
    expect(id).toBe("cus_new");
    expect(customersCreate).toHaveBeenCalledWith({ email: "a@example.com", metadata: { user_id: "u1" } });
  });

  it("never leaks anything beyond user_id into Stripe Customer metadata", async () => {
    const supabase = makeCustomerLookupSupabase(null);
    customersCreate.mockResolvedValue({ id: "cus_new" });
    await getOrCreateCustomerId(supabase, "u1", "a@example.com");
    const call = customersCreate.mock.calls[0][0];
    expect(Object.keys(call.metadata)).toEqual(["user_id"]);
  });
});

describe("createCheckoutSession", () => {
  it("throws price_not_configured when the plan's Stripe Price env var is unset — never invents a price id", async () => {
    const supabase = makeCustomerLookupSupabase(null);
    await expect(createCheckoutSession(supabase, { userId: "u1", email: "a@example.com", planId: "starter", appUrl: "http://localhost:3000" })).rejects.toMatchObject({
      code: "price_not_configured",
    });
    expect(checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("resolves the price id from server env, never from any client-supplied value", async () => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_test_starter";
    const supabase = makeCustomerLookupSupabase("cus_1");
    checkoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const result = await createCheckoutSession(supabase, { userId: "u1", email: "a@example.com", planId: "starter", appUrl: "http://localhost:3000" });
    expect(result.url).toBe("https://checkout.stripe.com/test");
    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_1",
        client_reference_id: "u1",
        line_items: [{ price: "price_test_starter", quantity: 1 }],
        success_url: expect.stringContaining("http://localhost:3000/dashboard/billing"),
        cancel_url: expect.stringContaining("http://localhost:3000/dashboard/billing"),
      }),
    );
  });

  it("refuses to start a new Checkout for an already-entitled (active) subscriber — duplicate-subscription protection", async () => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_test_starter";
    const supabase = makeCustomerLookupSupabase("cus_1", "active");
    await expect(createCheckoutSession(supabase, { userId: "u1", email: "a@example.com", planId: "starter", appUrl: "http://localhost:3000" })).rejects.toMatchObject({
      code: "already_subscribed",
    });
    expect(checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("allows checkout for a user whose subscription is canceled (not entitled)", async () => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_test_starter";
    const supabase = makeCustomerLookupSupabase("cus_1", "canceled");
    checkoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    await expect(createCheckoutSession(supabase, { userId: "u1", email: "a@example.com", planId: "starter", appUrl: "http://localhost:3000" })).resolves.toMatchObject({
      url: "https://checkout.stripe.com/test",
    });
  });

  it("throws stripe_error when Stripe returns no session url", async () => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_test_starter";
    const supabase = makeCustomerLookupSupabase("cus_1");
    checkoutSessionsCreate.mockResolvedValue({ url: null });
    await expect(createCheckoutSession(supabase, { userId: "u1", email: "a@example.com", planId: "starter", appUrl: "http://localhost:3000" })).rejects.toBeInstanceOf(StripeServiceError);
  });
});

describe("createBillingPortalSession", () => {
  it("throws invalid_config when the user has no Stripe customer mapping yet", async () => {
    const supabase = makeCustomerLookupSupabase(null);
    await expect(createBillingPortalSession(supabase, { userId: "u1", appUrl: "http://localhost:3000" })).rejects.toMatchObject({ code: "invalid_config" });
    expect(billingPortalSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a portal session for the canonical customer id, never a browser-supplied one", async () => {
    const supabase = makeCustomerLookupSupabase("cus_1");
    billingPortalSessionsCreate.mockResolvedValue({ url: "https://billing.stripe.com/test" });
    const result = await createBillingPortalSession(supabase, { userId: "u1", appUrl: "http://localhost:3000" });
    expect(result.url).toBe("https://billing.stripe.com/test");
    expect(billingPortalSessionsCreate).toHaveBeenCalledWith({ customer: "cus_1", return_url: "http://localhost:3000/dashboard/billing" });
  });
});
