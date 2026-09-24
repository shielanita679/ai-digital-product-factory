/**
 * Centralized credit configuration — the single place these numbers live.
 * Nothing in a service/Server Action should hard-code a credit cost or
 * grant amount directly.
 */

/** One-time grant, idempotent per user — see CreditService.ensureSignupCreditsGranted. */
export const FREE_SIGNUP_CREDITS = 20;

export const CREDIT_COSTS = {
  imageGeneration: 1,
  vectorGeneration: 1,
  mockupGeneration: 1,
  listingGeneration: 1,
} as const;

/** Must match the `entry_type` CHECK constraint in supabase/migrations. */
export const CREDIT_ENTRY_TYPE_VALUES = [
  "signup_grant",
  "subscription_grant",
  "generation_charge",
  "refund",
  "adjustment",
] as const;
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPE_VALUES)[number];

export function creditEntryTypeLabel(entryType: string): string {
  switch (entryType as CreditEntryType) {
    case "signup_grant":
      return "Free signup credits";
    case "subscription_grant":
      return "Subscription credits";
    case "generation_charge":
      return "Generation";
    case "refund":
      return "Refund";
    case "adjustment":
      return "Adjustment";
    default:
      return entryType;
  }
}
