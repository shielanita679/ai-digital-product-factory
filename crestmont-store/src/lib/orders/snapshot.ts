import type { PricedLine } from "@/lib/checkout";
import type { PendingOrderItem } from "./types";

/**
 * Builds the order-item snapshot stored with a new order. Values come from
 * the server-side priced cart (catalog), never from the browser, and are
 * copied — later catalog edits don't change a stored order.
 */
export function buildOrderItemsSnapshot(lines: readonly PricedLine[]): PendingOrderItem[] {
  return lines.map((l) => ({
    productId: l.productId,
    sku: l.sku,
    productName: l.name,
    variantName: l.variant || null,
    quantity: l.quantity,
    unitAmount: l.unitAmountCents,
  }));
}

/** Minutes a checkout may stay open. Stripe's minimum session lifetime is 30 minutes. */
export const CHECKOUT_SESSION_MINUTES = 30;
/** Extra time before the database sweeper releases a reservation whose expiry webhook never arrived. */
export const RESERVATION_GRACE_MINUTES = 15;
/** How long a reservation is held while a delayed payment method clears. */
export const DELAYED_PAYMENT_HOLD_DAYS = 10;
