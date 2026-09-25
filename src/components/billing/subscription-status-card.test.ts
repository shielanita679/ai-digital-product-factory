import { describe, it, expect } from "vitest";

import { getRenewalOrCancellationLabel } from "@/components/billing/subscription-status-card";

/**
 * D/E from the Phase 11 scheduled-cancellation fix: the Billing UI must
 * show "Cancels on ..." whenever Stripe has scheduled a future
 * cancellation via EITHER mechanism (cancel_at_period_end OR an explicit
 * cancel_at), and "Renews on ..." otherwise — never the reverse. Tested as
 * a pure function (same convention as listing-license-section.test.ts)
 * rather than a full render, since this repo has no React rendering test
 * harness configured.
 */
describe("getRenewalOrCancellationLabel", () => {
  it("D. shows 'Cancels on ...' using the explicit cancel_at date when Stripe set one (the live-verified case: cancel_at_period_end=false, cancel_at set)", () => {
    const label = getRenewalOrCancellationLabel({
      status: "active",
      cancel_at_period_end: false,
      cancel_at: "2026-10-25T09:16:32.000Z",
      current_period_end: "2026-10-25T09:16:32.000Z",
    });
    expect(label).toBe("Cancels on Oct 25, 2026");
  });

  it("D2. shows 'Cancels on ...' for the classic cancel_at_period_end=true case, using current_period_end since Stripe never set cancel_at", () => {
    const label = getRenewalOrCancellationLabel({
      status: "active",
      cancel_at_period_end: true,
      cancel_at: null,
      current_period_end: "2026-10-25T09:16:32.000Z",
    });
    expect(label).toBe("Cancels on Oct 25, 2026");
  });

  it("E. shows 'Renews on ...' when nothing is scheduled to cancel", () => {
    const label = getRenewalOrCancellationLabel({
      status: "active",
      cancel_at_period_end: false,
      cancel_at: null,
      current_period_end: "2026-10-25T09:16:32.000Z",
    });
    expect(label).toBe("Renews on Oct 25, 2026");
  });

  it("a cancel_at that differs from current_period_end (a cancellation scheduled for a different date than the period boundary) uses cancel_at, not current_period_end", () => {
    const label = getRenewalOrCancellationLabel({
      status: "active",
      cancel_at_period_end: false,
      cancel_at: "2026-10-20T00:00:00.000Z",
      current_period_end: "2026-10-25T09:16:32.000Z",
    });
    expect(label).toBe("Cancels on Oct 20, 2026");
  });
});
