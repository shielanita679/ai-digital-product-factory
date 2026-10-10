/**
 * Store operating terms: currency, fulfillment, shipping, returns.
 *
 * Values set to `null` are business decisions that have not been confirmed
 * yet. Until they are filled in:
 *   - the storefront shows a clearly marked "[to be confirmed]" placeholder
 *     wherever the value appears, and
 *   - checkout refuses to create payment sessions (see lib/launch.ts), and
 *   - `npm run check:launch` fails.
 *
 * Enter only terms you can actually meet. Do not guess.
 */

export type ShippingRate = {
  id: string;
  label: string;
  /** Flat rate in cents. */
  amountCents: number;
  /** Delivery estimate shown at checkout, in business days after dispatch. */
  deliveryDays: { min: number; max: number } | null;
};

export const commerce = {
  currency: "USD",
  locale: "en-US",

  /** ISO country codes you ship to. Checkout only accepts these addresses. */
  shipToCountries: ["US"] as string[],

  /** Time to prepare and hand an order to the carrier, e.g. "1–3 business days". */
  processingTime: null as string | null,

  /** Domestic transit estimate after dispatch, e.g. "3–7 business days". */
  domesticDeliveryEstimate: null as string | null,

  /**
   * International shipping. Leave `enabled: false` unless you actually ship
   * abroad; if you do, add the countries to `shipToCountries` above.
   */
  international: {
    enabled: false,
    deliveryEstimate: null as string | null,
  },

  /** Carriers you use, e.g. "USPS, UPS". */
  carriers: null as string | null,

  /**
   * Shipping options offered at checkout. Leave empty until real rates are
   * set — checkout stays disabled while this is empty.
   * Example: [{ id: "standard", label: "Standard shipping", amountCents: 795, deliveryDays: { min: 3, max: 7 } }]
   */
  shippingRates: [] as ShippingRate[],

  /** Order subtotal (cents) at or above which standard shipping is free. Null = no free-shipping offer. */
  freeShippingThresholdCents: null as number | null,

  /** Ship to P.O. boxes / APO/FPO addresses? null = not yet decided. */
  shipsToPOBoxes: null as boolean | null,

  /** How long after ordering a customer can still request an address change or cancellation, e.g. "within 12 hours of placing the order, before it ships". */
  orderChangeWindow: null as string | null,

  /** How soon a missing, damaged, or incorrect delivery must be reported, e.g. "within 7 days of the delivery date". */
  deliveryIssueReportWindow: null as string | null,

  returns: {
    /** Days after delivery during which a return can be requested. */
    windowDays: null as number | null,
    /** Who pays return shipping for change-of-mind returns. */
    returnShippingPaidBy: null as "customer" | "store" | null,
    /** Restocking fee as a percentage. 0 = none. Null = not yet decided. */
    restockingFeePercent: null as number | null,
    /** Business days to issue a refund after the return is received and inspected. */
    refundProcessingDays: null as string | null,
    /** Categories that cannot be returned for change of mind. */
    nonReturnable: [
      "Gift cards (if offered)",
      "Items marked as final sale on the product page at the time of purchase",
      "Items returned used, washed, damaged after delivery, or without original packaging",
    ],
  },

  /** Sales tax: when STRIPE_AUTOMATIC_TAX=true, tax is calculated by Stripe Tax at checkout. */
  maxQuantityPerLine: 10,
} as const;

/** Formats a number of cents in the store currency. */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(commerce.locale, {
    style: "currency",
    currency: commerce.currency,
  }).format(cents / 100);
}
