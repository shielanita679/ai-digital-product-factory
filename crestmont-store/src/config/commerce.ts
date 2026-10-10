/**
 * Store operating terms: payments, fulfillment, shipping, order changes,
 * returns and refunds.
 *
 * These are the store's PROPOSED operating policies. Every policy page, the
 * FAQ, product pages and checkout read from here, so changing a value here
 * changes it everywhere. Enter only terms the business can actually meet.
 *
 * Values left `null` are unresolved. Checkout refuses to create payment
 * sessions while any required value is unresolved (lib/launch.ts), and
 * `npm run check:launch` lists them.
 */

export type ShippingRate = {
  id: string;
  label: string;
  /** Flat rate in cents. */
  amountCents: number;
  /** Delivery estimate shown at checkout, in business days after dispatch. */
  deliveryDays: { min: number; max: number } | null;
};

export type FulfillmentMethod = "self" | "third_party_logistics" | "supplier_dropship" | "print_on_demand";

export const commerce = {
  currency: "USD",
  locale: "en-US",

  /**
   * Master switch for taking payments. While false, no Stripe client is ever
   * created — even if Stripe variables happen to be present in the
   * environment — and checkout stays closed. Turn on only after the store's
   * own Stripe account, tax setup and shipping rates are confirmed.
   */
  paymentsEnabled: false,

  // ------------------------------------------------------------------ Fulfillment
  /** How orders are fulfilled. Unresolved until arrangements are confirmed. */
  fulfillmentMethod: null as FulfillmentMethod | null,

  // ------------------------------------------------------------------ Shipping
  /** ISO country codes you ship to. Checkout only accepts these addresses. */
  shipToCountries: ["US"] as string[],

  /** Time to process an order and hand it to the shipping service. */
  processingTime: "1–2 business days" as string | null,

  /** US transit estimate. Begins after the order has been processed and dispatched. */
  domesticDeliveryEstimate: "3–7 business days" as string | null,

  /** International shipping — not available at initial launch. */
  international: {
    enabled: false,
    deliveryEstimate: null as string | null,
  },

  /**
   * Carriers used. Left unset until fulfillment arrangements are confirmed;
   * the site then refers neutrally to "the shipping service".
   */
  carriers: null as string | null,

  /** When tracking is provided. */
  trackingPolicy: "when the shipping service used for the order supports tracking",

  /**
   * Shipping options charged at checkout. Rates are calculated/displayed at
   * checkout from these; checkout stays closed while this is empty.
   * Example: [{ id: "standard", label: "Standard shipping", amountCents: 0, deliveryDays: { min: 3, max: 7 } }]
   */
  shippingRates: [] as ShippingRate[],

  /** Free-shipping threshold in cents. Null = not offered or advertised. */
  freeShippingThresholdCents: null as number | null,

  /**
   * Delivery to P.O. boxes and APO/FPO/DPO addresses.
   * "not_guaranteed" = the store does not promise delivery to these addresses.
   */
  poBoxAndMilitaryAddresses: "not_guaranteed" as "supported" | "not_guaranteed" | "not_supported",

  // ------------------------------------------------------------------ Order changes
  /** Cut-off for cancellation and shipping-address change requests. */
  orderChangeCutoff: "before the order has entered fulfillment",

  // ------------------------------------------------------------------ Damaged / incorrect items
  damagedOrIncorrect: {
    /** Deadline for reporting a damaged or incorrect delivery. */
    reportWindow: "within 7 days of delivery",
    /** What the customer is asked to provide. */
    requiredInformation: [
      "your order number",
      "a description of the issue",
      "photographs showing the damage or the incorrect item, where reasonably applicable",
    ],
    /** Resolutions support may offer, depending on circumstances and availability. */
    possibleResolutions: ["a replacement", "a refund", "another appropriate resolution"],
  },

  // ------------------------------------------------------------------ Returns & refunds
  returns: {
    /** Standard return window, in days after delivery. */
    windowDays: 30 as number | null,
    /** Conditions for a standard (change-of-mind) return. */
    conditions: [
      "The item is unused.",
      "The item is in the condition in which it was received.",
      "Original packaging is included, where applicable.",
      "Proof of purchase or order information may be required.",
    ],
    /** Who pays return shipping for change-of-mind returns. */
    returnShippingPaidBy: "customer" as "customer" | "store" | null,
    /** Restocking fee percentage. 0 = none. */
    restockingFeePercent: 0 as number | null,
    /** Merchant processing period for approved refunds, after the return is received and inspected. */
    refundProcessingDays: "5–10 business days" as string | null,
    /** Direct exchanges offered? */
    exchangesOffered: false,
    /**
     * Not eligible for the standard return flow. Individual products are
     * marked final sale with `returnable: false` in the catalog, which is
     * authoritative and shown on the product page before purchase.
     */
    nonReturnable: [
      "Gift cards, if gift cards are introduced in the future",
      "Products identified as final sale or non-returnable on the product page before purchase",
    ],
  },

  /**
   * Sales tax. Stripe Tax is used only when STRIPE_AUTOMATIC_TAX=true; it is
   * off by default and will be finalized before payments are activated.
   */
  maxQuantityPerLine: 10,
} as const;

/** Formats a number of cents in the store currency. */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat(commerce.locale, {
    style: "currency",
    currency: commerce.currency,
  }).format(cents / 100);
}
