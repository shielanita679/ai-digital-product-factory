import { describe, it, expect } from "vitest";

import { SUBSCRIPTION_STATUS_VALUES, isEntitledStatus, subscriptionStatusMeta, subscriptionStatusLabel, hasScheduledCancellation, getEffectiveCancellationDate } from "@/config/subscription";

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

/**
 * Live-verified root cause: Stripe Customer Portal showed "Cancels Oct 25"
 * for a subscription whose API state was cancel_at_period_end=false with
 * an explicit cancel_at timestamp set instead — code checking only
 * cancel_at_period_end would have missed it. These tests cover the two
 * independent Stripe mechanisms and the explicit non-signal (canceled_at).
 */
describe("hasScheduledCancellation", () => {
  it("A. active + cancel_at_period_end=false + a future cancel_at => scheduled cancellation", () => {
    expect(hasScheduledCancellation("active", false, "2026-10-25T09:16:32.000Z")).toBe(true);
  });

  it("B. active + cancel_at_period_end=true (no cancel_at at all) => scheduled cancellation", () => {
    expect(hasScheduledCancellation("active", true, null)).toBe(true);
  });

  it("C. active + neither cancellation mechanism => renewing normally, not scheduled to cancel", () => {
    expect(hasScheduledCancellation("active", false, null)).toBe(false);
  });

  it("trialing behaves the same as active for both mechanisms", () => {
    expect(hasScheduledCancellation("trialing", false, "2026-10-25T09:16:32.000Z")).toBe(true);
    expect(hasScheduledCancellation("trialing", false, null)).toBe(false);
  });

  it("a non-entitled status is never reported as 'scheduled to cancel' even if cancel_at/cancel_at_period_end are set — nothing to cancel once already past_due/canceled", () => {
    expect(hasScheduledCancellation("past_due", true, "2026-10-25T09:16:32.000Z")).toBe(false);
    expect(hasScheduledCancellation("canceled", true, "2026-10-25T09:16:32.000Z")).toBe(false);
  });

  it("no subscription row at all (null/undefined status) is never scheduled to cancel", () => {
    expect(hasScheduledCancellation(null, false, null)).toBe(false);
    expect(hasScheduledCancellation(undefined, true, "2026-10-25T09:16:32.000Z")).toBe(false);
  });
});

describe("getEffectiveCancellationDate", () => {
  it("prefers the explicit cancel_at timestamp when set", () => {
    expect(getEffectiveCancellationDate("2026-10-20T00:00:00.000Z", true, "2026-10-25T09:16:32.000Z")).toBe("2026-10-20T00:00:00.000Z");
  });

  it("falls back to current_period_end for the classic cancel_at_period_end=true case (Stripe never sets cancel_at for it)", () => {
    expect(getEffectiveCancellationDate(null, true, "2026-10-25T09:16:32.000Z")).toBe("2026-10-25T09:16:32.000Z");
  });

  it("returns null when nothing is scheduled — caller should show the normal renewal date instead", () => {
    expect(getEffectiveCancellationDate(null, false, "2026-10-25T09:16:32.000Z")).toBeNull();
  });
});
