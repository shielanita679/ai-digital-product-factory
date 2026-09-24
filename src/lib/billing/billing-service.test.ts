import { describe, it, expect } from "vitest";

import { getBillingState } from "@/lib/billing/billing-service";

type Row = Record<string, unknown>;

function makeFakeSupabase(row: Row | null, migrationApplied = true) {
  return {
    from() {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (!migrationApplied) return { data: null, error: { code: "PGRST205", message: "not found" } };
              return { data: row, error: null };
            },
          }),
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

describe("getBillingState", () => {
  it("returns plan=free, isEntitled=false when there is no subscription row (absence IS the free plan)", async () => {
    const supabase = makeFakeSupabase(null);
    const state = await getBillingState({ supabase, userId: "u1" });
    expect(state.planId).toBe("free");
    expect(state.isEntitled).toBe(false);
    expect(state.subscription).toBeNull();
  });

  it("active status is entitled", async () => {
    const supabase = makeFakeSupabase({ plan_key: "starter", status: "active" });
    const state = await getBillingState({ supabase, userId: "u1" });
    expect(state.planId).toBe("starter");
    expect(state.isEntitled).toBe(true);
  });

  it("trialing status is entitled", async () => {
    const supabase = makeFakeSupabase({ plan_key: "pro", status: "trialing" });
    const state = await getBillingState({ supabase, userId: "u1" });
    expect(state.isEntitled).toBe(true);
  });

  it("past_due is NOT entitled — 'do not treat every Stripe status as active entitlement'", async () => {
    const supabase = makeFakeSupabase({ plan_key: "starter", status: "past_due" });
    const state = await getBillingState({ supabase, userId: "u1" });
    expect(state.isEntitled).toBe(false);
  });

  it("canceled is NOT entitled", async () => {
    const supabase = makeFakeSupabase({ plan_key: "starter", status: "canceled" });
    const state = await getBillingState({ supabase, userId: "u1" });
    expect(state.isEntitled).toBe(false);
  });

  it("incomplete is NOT entitled", async () => {
    const supabase = makeFakeSupabase({ plan_key: "starter", status: "incomplete" });
    const state = await getBillingState({ supabase, userId: "u1" });
    expect(state.isEntitled).toBe(false);
  });

  it("degrades to free/not-entitled when the migration hasn't been applied yet — never throws", async () => {
    const supabase = makeFakeSupabase(null, false);
    const state = await getBillingState({ supabase, userId: "u1" });
    expect(state.planId).toBe("free");
    expect(state.isEntitled).toBe(false);
  });
});
