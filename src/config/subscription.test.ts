import { describe, it, expect } from "vitest";

import { SUBSCRIPTION_STATUS_VALUES, isEntitledStatus, subscriptionStatusMeta, subscriptionStatusLabel } from "@/config/subscription";

describe("isEntitledStatus — the single source of truth for paid entitlement", () => {
  it("active and trialing are entitled", () => {
    expect(isEntitledStatus("active")).toBe(true);
    expect(isEntitledStatus("trialing")).toBe(true);
  });

  it("every other declared Stripe status is NOT entitled — 'do not treat every status as active'", () => {
    const nonEntitled = SUBSCRIPTION_STATUS_VALUES.filter((s) => s !== "active" && s !== "trialing");
    expect(nonEntitled).toContain("past_due");
    for (const status of nonEntitled) {
      expect(isEntitledStatus(status)).toBe(false);
    }
  });

  it("null/undefined (no subscription row at all, i.e. the free plan) is not entitled", () => {
    expect(isEntitledStatus(null)).toBe(false);
    expect(isEntitledStatus(undefined)).toBe(false);
  });

  it("an unrecognized status is not entitled", () => {
    expect(isEntitledStatus("some_future_stripe_status")).toBe(false);
  });
});

describe("subscriptionStatusMeta / subscriptionStatusLabel", () => {
  it("every declared status has metadata", () => {
    for (const status of SUBSCRIPTION_STATUS_VALUES) {
      expect(subscriptionStatusMeta[status]).toBeDefined();
      expect(subscriptionStatusMeta[status].label.length).toBeGreaterThan(0);
    }
  });

  it("labels a known status", () => {
    expect(subscriptionStatusLabel("past_due")).toBe("Past Due");
  });

  it("falls back to echoing an unknown status rather than throwing", () => {
    expect(subscriptionStatusLabel("made_up_status")).toBe("made_up_status");
  });
});
