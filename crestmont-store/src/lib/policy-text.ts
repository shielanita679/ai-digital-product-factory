import { commerce } from "@/config/commerce";

/**
 * Small phrases derived from config/commerce.ts and reused across policy
 * pages, the FAQ and product pages, so the same term is always worded the
 * same way.
 */

/** "the shipping service" until carriers are confirmed. */
export function carrierPhrase(): string {
  return commerce.carriers ?? "the shipping service selected for your order";
}

/** "a replacement, a refund or another appropriate resolution" */
export function resolutionsPhrase(): string {
  const r = commerce.damagedOrIncorrect.possibleResolutions;
  return r.length > 1 ? `${r.slice(0, -1).join(", ")} or ${r[r.length - 1]}` : r[0];
}

/** "your order number, a description of the issue and photographs ..." */
export function requiredInfoPhrase(): string {
  const r = commerce.damagedOrIncorrect.requiredInformation;
  return r.length > 1 ? `${r.slice(0, -1).join(", ")} and ${r[r.length - 1]}` : r[0];
}

export const deliveryDisclaimer = "Estimated delivery times begin after an order has been processed and dispatched. Delivery dates are estimates, not guarantees.";
