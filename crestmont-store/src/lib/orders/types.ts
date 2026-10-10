/**
 * Order domain types shared by the service layer, routes and UI.
 * Status values mirror the Prisma enums (prisma/schema.prisma); a test
 * keeps them in sync.
 */

export const PAYMENT_STATUSES = ["PENDING", "PROCESSING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "FAILED", "EXPIRED", "CANCELLED"] as const;
export const FULFILLMENT_STATUSES = ["UNFULFILLED", "ON_HOLD", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"] as const;
export const SHIPMENT_STATUSES = ["PENDING", "LABEL_CREATED", "IN_TRANSIT", "DELIVERED", "EXCEPTION", "RETURNED", "CANCELLED"] as const;
export const MOVEMENT_TYPES = ["INITIAL_STOCK", "SALE", "REFUND_RESTOCK", "CANCELLATION_RESTOCK", "RETURN_RESTOCK", "MANUAL_ADJUSTMENT"] as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];
export type FulfillmentStatusValue = (typeof FULFILLMENT_STATUSES)[number];
export type ShipmentStatusValue = (typeof SHIPMENT_STATUSES)[number];
export type MovementTypeValue = (typeof MOVEMENT_TYPES)[number];

/** Payment states in which the customer has paid (possibly partly refunded since). */
export const PAID_STATES: readonly PaymentStatusValue[] = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"];

/** Item snapshot stored with a new order — built server-side from the catalog. */
export type PendingOrderItem = {
  productId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitAmount: number;
};

/** Normalized Stripe Checkout Session data used to finalize a paid order. */
export type PaidSessionInput = {
  id: string;
  orderId: string | null;
  paymentIntent: string | null;
  customerEmail: string | null;
  customerName: string | null;
  shipping: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
  currency: string;
  amountSubtotal: number;
  amountShipping: number;
  amountTax: number;
  amountDiscount: number;
  amountTotal: number;
};

/** What a customer sees from an order lookup — no address, email or payment ids. */
export type PublicOrderStatus = {
  orderNumber: string;
  placedAt: string;
  paymentStatus: PaymentStatusValue;
  fulfillmentStatus: FulfillmentStatusValue;
  items: { productName: string; variantName: string | null; quantity: number }[];
  shipments: {
    carrier: string | null;
    service: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: ShipmentStatusValue;
    shippedAt: string | null;
    deliveredAt: string | null;
  }[];
};
