/** Must match the `status` CHECK constraint in supabase/migrations — mirrors Stripe's own subscription status values. */
export const SUBSCRIPTION_STATUS_VALUES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS_VALUES)[number];

/**
 * Centralized entitlement rule — the ONLY place "does this status mean the
 * seller has active paid access" is decided. Deliberately narrow: `trialing`
 * and `active` are the only statuses that represent real, current
 * entitlement. `past_due` is intentionally NOT entitled — Stripe is still
 * attempting to collect payment, and the Phase 11 spec's "do not treat
 * every Stripe status as active entitlement" applies most directly here.
 * Monthly credit grants are separately gated on a verified paid invoice
 * (see WebhookService), independent of this display-level entitlement
 * check.
 */
export function isEntitledStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/**
 * Whether an entitled (active/trialing) subscription has a future
 * cancellation scheduled — the "Cancels on ..." vs "Renews on ..." signal.
 * Stripe supports TWO independent ways to represent this: the classic
 * `cancel_at_period_end` boolean, and an explicit `cancel_at` timestamp
 * that can be set without ever setting cancel_at_period_end=true.
 * Live-verified: Stripe Customer Portal showed "Cancels Oct 25" for a
 * subscription whose API state was cancel_at_period_end=false with
 * cancel_at holding the matching future timestamp — code that checked
 * only cancel_at_period_end would have missed this entirely. Deliberately
 * does NOT look at `canceled_at` — Stripe can populate that field to
 * record WHEN a cancellation was scheduled while status remains fully
 * active; it is never a signal of current entitlement or of a scheduled
 * future cancellation on its own. Returns false for a non-entitled status
 * (nothing to "cancel" once already past_due/canceled/etc. — those get
 * their own distinct UI treatment, not a "Cancels on" date).
 */
export function hasScheduledCancellation(status: string | null | undefined, cancelAtPeriodEnd: boolean | null | undefined, cancelAt: string | null | undefined): boolean {
  if (!isEntitledStatus(status)) return false;
  return !!cancelAtPeriodEnd || !!cancelAt;
}

/**
 * The date to display alongside "Cancels on ..." — `cancel_at` when
 * Stripe set one explicitly (it may differ from current_period_end, e.g.
 * a cancellation scheduled for a date other than the period boundary),
 * falling back to `current_period_end` for the classic
 * cancel_at_period_end=true case where Stripe never sets cancel_at at
 * all. Returns null when nothing is scheduled — callers should show the
 * normal "Renews on {current_period_end}" copy instead.
 */
export function getEffectiveCancellationDate(cancelAt: string | null | undefined, cancelAtPeriodEnd: boolean | null | undefined, currentPeriodEnd: string | null | undefined): string | null {
  if (cancelAt) return cancelAt;
  if (cancelAtPeriodEnd) return currentPeriodEnd ?? null;
  return null;
}

export const subscriptionStatusMeta: Record<
  SubscriptionStatus,
  { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }
> = {
  incomplete: { label: "Incomplete", badgeVariant: "outline" },
  incomplete_expired: { label: "Expired", badgeVariant: "outline" },
  trialing: { label: "Trialing", badgeVariant: "accent" },
  active: { label: "Active", badgeVariant: "success" },
  past_due: { label: "Past Due", badgeVariant: "outline" },
  canceled: { label: "Canceled", badgeVariant: "outline" },
  unpaid: { label: "Unpaid", badgeVariant: "outline" },
  paused: { label: "Paused", badgeVariant: "outline" },
};

export function subscriptionStatusLabel(status: string): string {
  return subscriptionStatusMeta[status as SubscriptionStatus]?.label ?? status;
}
