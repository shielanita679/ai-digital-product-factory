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
