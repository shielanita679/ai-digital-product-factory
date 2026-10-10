import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { createOrderReference } from "@/lib/order-reference";

import { PAID_STATES, type FulfillmentStatusValue, type MovementTypeValue, type PaidSessionInput, type PendingOrderItem, type PublicOrderStatus, type ShipmentStatusValue } from "./types";

/**
 * Order & inventory service — all commerce writes live here.
 *
 * Every operation that changes more than one row runs inside ONE MySQL
 * transaction (Prisma interactive transaction, READ COMMITTED). Either all of
 * its changes commit or none do.
 *
 * Stock is changed only by single conditional UPDATE statements, e.g.
 *
 *   UPDATE inventory SET quantity_reserved = quantity_reserved + ?
 *    WHERE sku = ? AND quantity_on_hand - quantity_reserved >= ?
 *
 * InnoDB locks the row for the UPDATE; a concurrent transaction on the same
 * row waits, then evaluates the WHERE clause against the latest committed
 * values. If stock is no longer sufficient, zero rows change and the
 * operation fails — nothing is read into JavaScript, subtracted and written
 * back. Rows are locked in SKU order to avoid deadlocks, CHECK constraints
 * forbid negative stock, and deadlocks/lock timeouts are retried.
 *
 * This module receives the database client as a parameter so it can be
 * tested against a real MySQL/MariaDB. Production code reaches it only
 * through the server-only repository.
 */

export type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 20_000,
} as const;

export class InsufficientStockError extends Error {
  constructor(public readonly sku: string) {
    super(`insufficient_stock:${sku}`);
    this.name = "InsufficientStockError";
  }
}
export class OrderNotFoundError extends Error {
  constructor(ref: string) {
    super(`order_not_found:${ref}`);
    this.name = "OrderNotFoundError";
  }
}
export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}
export class OrderNotPaidError extends Error {
  constructor() {
    super("order_not_paid");
    this.name = "OrderNotPaidError";
  }
}

const SKU_PATTERN = /^CH-[A-Z0-9]+(-[A-Z0-9]+)+$/;

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  return code === "P2034" || /deadlock|lock wait timeout|try restarting transaction/i.test(message);
}

function isUniqueViolationOn(err: unknown, column: string): boolean {
  const e = err as { code?: string; meta?: unknown; message?: string };
  return e?.code === "P2002" && JSON.stringify(e.meta ?? e.message ?? "").includes(column);
}

/** Runs fn in a transaction, retrying on deadlock / lock-wait timeout. */
async function transaction<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(fn, TX_OPTIONS);
    } catch (err) {
      if (attempt < 4 && isRetryable(err)) {
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.floor(Math.random() * 25)));
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers (always called inside a transaction)
// ---------------------------------------------------------------------------

/**
 * Idempotency gate. Inserts the Stripe event if new and locks its row, so
 * concurrent deliveries of the same event serialize here. Returns true if
 * the event was already handled and must be skipped.
 */
async function claimStripeEvent(tx: Tx, eventId: string, eventType: string): Promise<boolean> {
  await tx.$executeRaw`
    INSERT INTO stripe_events (id, stripe_event_id, event_type, status, attempts, received_at)
    VALUES (${randomUUID()}, ${eventId}, ${eventType}, 'PROCESSING', 1, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE stripe_event_id = stripe_event_id`;
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM stripe_events WHERE stripe_event_id = ${eventId} FOR UPDATE`;
  const status = rows[0]?.status;
  if (status === "PROCESSED" || status === "IGNORED") return true;
  if (status === "FAILED") {
    await tx.stripeEvent.update({ where: { stripeEventId: eventId }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
  }
  return false;
}

async function completeStripeEvent(tx: Tx, eventId: string, orderId: string | null, status: "PROCESSED" | "IGNORED", note: string | null) {
  await tx.stripeEvent.update({
    where: { stripeEventId: eventId },
    data: { status, orderId: orderId ?? undefined, lastError: note, processedAt: new Date() },
  });
}

/** Locks and returns an order row (SELECT ... FOR UPDATE). */
async function lockOrder(tx: Tx, where: { id?: string | null; sessionId?: string | null; paymentIntentId?: string | null }) {
  let rows: { id: string }[] = [];
  if (where.sessionId) {
    rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM orders
       WHERE stripe_checkout_session_id = ${where.sessionId}
          OR (stripe_checkout_session_id IS NULL AND id = ${where.id ?? ""})
       LIMIT 1 FOR UPDATE`;
  } else if (where.paymentIntentId) {
    rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE stripe_payment_intent_id = ${where.paymentIntentId} LIMIT 1 FOR UPDATE`;
  } else if (where.id) {
    rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${where.id} FOR UPDATE`;
  }
  if (!rows[0]) return null;
  return tx.order.findUniqueOrThrow({ where: { id: rows[0].id } });
}

/** Returns reserved stock for an order to the available pool. */
async function releaseReservation(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { sku: "asc" } });
  for (const item of items) {
    await tx.$executeRaw`
      UPDATE inventory
         SET quantity_reserved = quantity_reserved - ${item.quantity}, updated_at = CURRENT_TIMESTAMP(3)
       WHERE sku = ${item.sku} AND quantity_reserved >= ${item.quantity}`;
  }
  await tx.order.update({ where: { id: orderId }, data: { reservationStatus: "RELEASED" } });
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

function validateItems(items: PendingOrderItem[]) {
  if (items.length === 0) throw new InvalidRequestError("empty_order");
  const skus = new Set<string>();
  for (const i of items) {
    if (!Number.isInteger(i.quantity) || i.quantity <= 0 || i.quantity > 100) throw new InvalidRequestError(`invalid_quantity:${i.sku}`);
    if (!Number.isInteger(i.unitAmount) || i.unitAmount < 0) throw new InvalidRequestError(`invalid_unit_amount:${i.sku}`);
    if (!SKU_PATTERN.test(i.sku)) throw new InvalidRequestError(`invalid_sku:${i.sku}`);
    if (skus.has(i.sku)) throw new InvalidRequestError(`duplicate_sku:${i.sku}`);
    skus.add(i.sku);
  }
}

/**
 * Called when checkout starts, BEFORE the Stripe session exists. One
 * transaction: creates the order + item snapshot and reserves stock for
 * every item. Any shortfall throws InsufficientStockError and nothing is
 * written. Stock on hand is not reduced for an unpaid order.
 */
export async function createPendingOrder(db: Db, input: { currency: string; items: PendingOrderItem[]; reservationExpiresAt: Date }) {
  validateItems(input.items);
  if (input.reservationExpiresAt.getTime() <= Date.now()) throw new InvalidRequestError("invalid_reservation_expiry");
  const currency = input.currency.toLowerCase();
  const subtotal = input.items.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
  const sorted = [...input.items].sort((a, b) => a.sku.localeCompare(b.sku));

  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = createOrderReference();
    try {
      return await transaction(db, async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            currency,
            subtotalAmount: subtotal,
            totalAmount: subtotal,
            reservationExpiresAt: input.reservationExpiresAt,
            items: {
              create: sorted.map((i) => ({
                productId: i.productId,
                sku: i.sku,
                productName: i.productName,
                variantName: i.variantName,
                quantity: i.quantity,
                unitAmount: i.unitAmount,
                lineAmount: i.unitAmount * i.quantity,
                currency,
              })),
            },
          },
        });
        for (const i of sorted) {
          const changed = await tx.$executeRaw`
            UPDATE inventory
               SET quantity_reserved = quantity_reserved + ${i.quantity}, updated_at = CURRENT_TIMESTAMP(3)
             WHERE sku = ${i.sku} AND quantity_on_hand - quantity_reserved >= ${i.quantity}`;
          if (changed !== 1) throw new InsufficientStockError(i.sku);
        }
        return { orderId: order.id, orderNumber: order.orderNumber };
      });
    } catch (err) {
      if (isUniqueViolationOn(err, "order_number")) continue; // astronomically rare; pick another number
      throw err;
    }
  }
  throw new Error("could_not_allocate_order_number");
}

export async function attachCheckoutSession(db: Db, orderId: string, sessionId: string) {
  const res = await db.order.updateMany({
    where: { id: orderId, paymentStatus: "PENDING", stripeCheckoutSessionId: null },
    data: { stripeCheckoutSessionId: sessionId },
  });
  if (res.count !== 1) throw new InvalidRequestError("order_not_attachable");
}

/** Used when the Stripe session couldn't be created. Never touches a paid order. */
export async function cancelPendingOrder(db: Db, orderId: string) {
  await transaction(db, async (tx) => {
    const order = await lockOrder(tx, { id: orderId });
    if (!order || order.paymentStatus !== "PENDING") return;
    if (order.reservationStatus === "HELD") await releaseReservation(tx, order.id);
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "CANCELLED", cancelledAt: new Date() } });
  });
}

// ---------------------------------------------------------------------------
// Stripe webhook outcomes
// ---------------------------------------------------------------------------

export type EventResult = { result: string; orderId?: string; orderNumber?: string };

/**
 * The ONLY path that marks an order paid. One transaction:
 *   claim event → lock order → convert each reservation into a sale
 *   (on_hand -= qty, reserved -= qty) + one SALE ledger row per SKU →
 *   store customer/shipping/Stripe amounts → mark paid → mark event processed.
 *
 * If stock can't be deducted for an item (only possible if a reservation was
 * lost), stock is NOT pushed negative: the payment is still recorded, the
 * order is flagged requiresReview and fulfillment goes ON_HOLD for support.
 */
export async function handleCheckoutPaid(db: Db, eventId: string, eventType: string, session: PaidSessionInput): Promise<EventResult> {
  return transaction(db, async (tx) => {
    if (await claimStripeEvent(tx, eventId, eventType)) return { result: "duplicate" };

    const order = await lockOrder(tx, { sessionId: session.id, id: session.orderId });
    if (!order) throw new OrderNotFoundError(session.id);

    if (PAID_STATES.includes(order.paymentStatus)) {
      await completeStripeEvent(tx, eventId, order.id, "PROCESSED", "order already paid");
      return { result: "already_paid", orderId: order.id, orderNumber: order.orderNumber };
    }

    const review: string[] = [];
    const items = await tx.orderItem.findMany({ where: { orderId: order.id }, orderBy: { sku: "asc" } });
    for (const item of items) {
      const inv = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM inventory WHERE sku = ${item.sku} FOR UPDATE`)[0];
      if (!inv) {
        review.push(`no inventory record for ${item.sku}`);
        continue;
      }
      const changed =
        order.reservationStatus === "HELD"
          ? await tx.$executeRaw`
              UPDATE inventory
                 SET quantity_on_hand = quantity_on_hand - ${item.quantity},
                     quantity_reserved = quantity_reserved - ${item.quantity},
                     updated_at = CURRENT_TIMESTAMP(3)
               WHERE id = ${inv.id} AND quantity_reserved >= ${item.quantity} AND quantity_on_hand >= ${item.quantity}`
          : await tx.$executeRaw`
              UPDATE inventory
                 SET quantity_on_hand = quantity_on_hand - ${item.quantity}, updated_at = CURRENT_TIMESTAMP(3)
               WHERE id = ${inv.id} AND quantity_on_hand - quantity_reserved >= ${item.quantity}`;

      if (changed !== 1) {
        review.push(`insufficient stock to fulfil ${item.sku} x${item.quantity}`);
        if (order.reservationStatus === "HELD") {
          await tx.$executeRaw`
            UPDATE inventory SET quantity_reserved = quantity_reserved - ${item.quantity}, updated_at = CURRENT_TIMESTAMP(3)
             WHERE id = ${inv.id} AND quantity_reserved >= ${item.quantity}`;
        }
        continue;
      }

      const after = await tx.inventory.findUniqueOrThrow({ where: { id: inv.id }, select: { quantityOnHand: true } });
      await tx.inventoryMovement.create({
        data: {
          inventoryId: inv.id,
          orderId: order.id,
          type: "SALE",
          quantityDelta: -item.quantity,
          quantityOnHandAfter: after.quantityOnHand,
          reason: `Order ${order.orderNumber}`,
          reference: eventId,
          // Unique: a second SALE for this order+SKU is impossible.
          saleKey: `${order.id}:${inv.id}`,
        },
      });
    }

    const itemsTotal = items.reduce((s, i) => s + i.lineAmount, 0);
    if (session.amountSubtotal !== itemsTotal) review.push(`Stripe subtotal ${session.amountSubtotal} does not match order items ${itemsTotal}`);
    if (session.currency.toLowerCase() !== order.currency) review.push(`currency mismatch: ${session.currency} vs ${order.currency}`);
    if (!session.customerEmail) review.push("Stripe session has no customer email");

    const reason = review.length ? [order.reviewReason, ...review].filter(Boolean).join("; ") : order.reviewReason;
    await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        paidAt: new Date(),
        stripeCheckoutSessionId: order.stripeCheckoutSessionId ?? session.id,
        stripePaymentIntentId: session.paymentIntent,
        // Stripe Checkout always collects an email; the placeholder only
        // satisfies the NOT NULL rule and the order is flagged for review.
        customerEmail: (session.customerEmail ?? "missing-email@invalid.invalid").toLowerCase(),
        customerName: session.customerName,
        shippingName: session.shipping.name,
        shippingLine1: session.shipping.line1,
        shippingLine2: session.shipping.line2 || null,
        shippingCity: session.shipping.city,
        shippingState: session.shipping.state,
        shippingPostalCode: session.shipping.postalCode,
        shippingCountry: session.shipping.country?.toUpperCase() ?? null,
        subtotalAmount: session.amountSubtotal,
        shippingAmount: session.amountShipping,
        taxAmount: session.amountTax,
        discountAmount: session.amountDiscount,
        totalAmount: session.amountTotal,
        reservationStatus: "CONVERTED",
        requiresReview: order.requiresReview || review.length > 0,
        reviewReason: reason,
        // Payment never fulfils an order; a review only puts it on hold.
        fulfillmentStatus: review.length > 0 ? "ON_HOLD" : order.fulfillmentStatus,
      },
    });

    await completeStripeEvent(tx, eventId, order.id, "PROCESSED", null);
    return { result: review.length ? "paid_requires_review" : "paid", orderId: order.id, orderNumber: order.orderNumber };
  });
}

/** checkout.session.completed with a delayed payment method: keep the reservation while it clears. */
export async function handleCheckoutProcessing(db: Db, eventId: string, eventType: string, sessionId: string, holdUntil: Date): Promise<EventResult> {
  return transaction(db, async (tx) => {
    if (await claimStripeEvent(tx, eventId, eventType)) return { result: "duplicate" };
    const order = await lockOrder(tx, { sessionId });
    if (!order) throw new OrderNotFoundError(sessionId);
    if (order.paymentStatus === "PENDING") {
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PROCESSING",
          reservationExpiresAt: holdUntil > order.reservationExpiresAt ? holdUntil : order.reservationExpiresAt,
        },
      });
    }
    await completeStripeEvent(tx, eventId, order.id, "PROCESSED", null);
    return { result: "processing", orderId: order.id };
  });
}

/** checkout.session.expired / async_payment_failed: release the reservation. Never deducts stock. */
export async function handleCheckoutClosed(db: Db, eventId: string, eventType: string, sessionId: string, outcome: "EXPIRED" | "FAILED"): Promise<EventResult> {
  return transaction(db, async (tx) => {
    if (await claimStripeEvent(tx, eventId, eventType)) return { result: "duplicate" };
    const order = await lockOrder(tx, { sessionId });
    if (!order) {
      await completeStripeEvent(tx, eventId, null, "IGNORED", "no order for session");
      return { result: "no_order" };
    }
    if (order.paymentStatus === "PENDING" || order.paymentStatus === "PROCESSING") {
      if (order.reservationStatus === "HELD") await releaseReservation(tx, order.id);
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: outcome, cancelledAt: new Date() } });
    }
    await completeStripeEvent(tx, eventId, order.id, "PROCESSED", null);
    return { result: outcome.toLowerCase(), orderId: order.id };
  });
}

/**
 * charge.refunded — updates MONEY only. A refund never returns stock;
 * merchandise is restocked separately (adjustInventory with a *_RESTOCK
 * type) once it is back and judged sellable.
 * amountRefunded is Stripe's cumulative refunded amount for the charge.
 */
export async function recordRefund(db: Db, eventId: string, eventType: string, paymentIntentId: string, amountRefunded: number): Promise<EventResult> {
  if (!Number.isInteger(amountRefunded) || amountRefunded < 0) throw new InvalidRequestError("invalid_refund_amount");
  return transaction(db, async (tx) => {
    if (await claimStripeEvent(tx, eventId, eventType)) return { result: "duplicate" };
    const order = await lockOrder(tx, { paymentIntentId });
    if (!order) {
      await completeStripeEvent(tx, eventId, null, "IGNORED", "no order for payment intent");
      return { result: "no_order" };
    }
    const refunded = Math.min(Math.max(order.refundedAmount, amountRefunded), order.totalAmount);
    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedAmount: refunded,
        paymentStatus: refunded === 0 ? order.paymentStatus : refunded >= order.totalAmount ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
    });
    await completeStripeEvent(tx, eventId, order.id, "PROCESSED", null);
    return { result: "refund_recorded", orderId: order.id };
  });
}

export async function recordIgnoredStripeEvent(db: Db, eventId: string, eventType: string) {
  await db.$executeRaw`
    INSERT INTO stripe_events (id, stripe_event_id, event_type, status, attempts, received_at, processed_at)
    VALUES (${randomUUID()}, ${eventId}, ${eventType}, 'IGNORED', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE stripe_event_id = stripe_event_id`;
}

/** Records a processing failure (the processing transaction itself was rolled back). */
export async function recordStripeEventFailure(db: Db, eventId: string, eventType: string, error: string) {
  const message = error.slice(0, 2000);
  // last_error is assigned before status: MySQL evaluates these left to right.
  await db.$executeRaw`
    INSERT INTO stripe_events (id, stripe_event_id, event_type, status, attempts, last_error, received_at)
    VALUES (${randomUUID()}, ${eventId}, ${eventType}, 'FAILED', 1, ${message}, CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      last_error = IF(status IN ('PROCESSED', 'IGNORED'), last_error, ${message}),
      status     = IF(status IN ('PROCESSED', 'IGNORED'), status, 'FAILED')`;
}

/**
 * Safety net for checkouts whose expiry webhook never arrived: releases
 * reservations of PENDING orders past their reservationExpiresAt. Run it on a
 * schedule (see docs/HOSTINGER_SETUP.md).
 */
export async function releaseExpiredReservations(db: Db, now = new Date()): Promise<number> {
  const candidates = await db.order.findMany({
    where: { reservationStatus: "HELD", paymentStatus: "PENDING", reservationExpiresAt: { lt: now } },
    select: { id: true },
    take: 200,
    orderBy: { reservationExpiresAt: "asc" },
  });
  let released = 0;
  for (const { id } of candidates) {
    const done = await transaction(db, async (tx) => {
      const order = await lockOrder(tx, { id });
      // Re-check under the lock: the webhook may have paid it meanwhile.
      if (!order || order.paymentStatus !== "PENDING" || order.reservationStatus !== "HELD" || order.reservationExpiresAt >= now) return false;
      await releaseReservation(tx, order.id);
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "EXPIRED", cancelledAt: new Date() } });
      return true;
    });
    if (done) released++;
  }
  return released;
}

// ---------------------------------------------------------------------------
// Inventory administration
// ---------------------------------------------------------------------------

/** Registers a SKU with zero stock. Stock is then added with an INITIAL_STOCK movement. */
export async function registerInventorySku(db: Db, sku: string, productId: string) {
  if (!SKU_PATTERN.test(sku)) throw new InvalidRequestError(`invalid_sku:${sku}`);
  return db.inventory.create({ data: { sku, productId } });
}

const RESTOCK_TYPES: MovementTypeValue[] = ["REFUND_RESTOCK", "CANCELLATION_RESTOCK", "RETURN_RESTOCK"];

/**
 * Atomic stock change + ledger entry. SALE is not allowed here (sales only
 * happen in handleCheckoutPaid). Order-linked restocks can never exceed what
 * was sold to that order. Stock can't go below what's reserved.
 */
export async function adjustInventory(
  db: Db,
  input: { sku: string; quantityDelta: number; type: Exclude<MovementTypeValue, "SALE">; reason: string; orderId?: string | null },
) {
  if ((input.type as MovementTypeValue) === "SALE" || !["INITIAL_STOCK", "MANUAL_ADJUSTMENT", ...RESTOCK_TYPES].includes(input.type)) {
    throw new InvalidRequestError(`invalid_movement_type:${input.type}`);
  }
  if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) throw new InvalidRequestError("invalid_quantity");
  if (!input.reason?.trim()) throw new InvalidRequestError("reason_required");

  return transaction(db, async (tx) => {
    const inv = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM inventory WHERE sku = ${input.sku} FOR UPDATE`)[0];
    if (!inv) throw new InvalidRequestError(`unknown_sku:${input.sku}`);

    if (RESTOCK_TYPES.includes(input.type)) {
      if (!input.orderId) throw new InvalidRequestError("order_required");
      const sold = await tx.inventoryMovement.aggregate({ _sum: { quantityDelta: true }, where: { orderId: input.orderId, inventoryId: inv.id, type: "SALE" } });
      const restocked = await tx.inventoryMovement.aggregate({
        _sum: { quantityDelta: true },
        where: { orderId: input.orderId, inventoryId: inv.id, type: { in: RESTOCK_TYPES } },
      });
      const soldQty = -(sold._sum.quantityDelta ?? 0);
      if ((restocked._sum.quantityDelta ?? 0) + input.quantityDelta > soldQty) throw new InvalidRequestError("restock_exceeds_sold_quantity");
    }

    const changed = await tx.$executeRaw`
      UPDATE inventory
         SET quantity_on_hand = quantity_on_hand + ${input.quantityDelta}, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ${inv.id} AND quantity_on_hand + ${input.quantityDelta} >= quantity_reserved`;
    if (changed !== 1) throw new InsufficientStockError(input.sku);

    const after = await tx.inventory.findUniqueOrThrow({ where: { id: inv.id } });
    await tx.inventoryMovement.create({
      data: {
        inventoryId: inv.id,
        orderId: input.orderId ?? null,
        type: input.type,
        quantityDelta: input.quantityDelta,
        quantityOnHandAfter: after.quantityOnHand,
        reason: input.reason.trim(),
      },
    });
    return { sku: after.sku, quantityOnHand: after.quantityOnHand, quantityReserved: after.quantityReserved };
  });
}

/** Available-to-sell quantity per SKU (on hand minus reserved). */
export async function getAvailableStock(db: Db, skus: string[]): Promise<Map<string, number>> {
  const rows = await db.inventory.findMany({ where: { sku: { in: skus } }, select: { sku: true, quantityOnHand: true, quantityReserved: true } });
  return new Map(rows.map((r) => [r.sku, r.quantityOnHand - r.quantityReserved]));
}

// ---------------------------------------------------------------------------
// Fulfillment — deliberately separate from payment
// ---------------------------------------------------------------------------

export async function setFulfillmentStatus(db: Db, orderId: string, status: FulfillmentStatusValue) {
  await transaction(db, async (tx) => {
    const order = await lockOrder(tx, { id: orderId });
    if (!order) throw new OrderNotFoundError(orderId);
    if ((status === "FULFILLED" || status === "PARTIALLY_FULFILLED") && !PAID_STATES.includes(order.paymentStatus)) throw new OrderNotPaidError();
    await tx.order.update({ where: { id: orderId }, data: { fulfillmentStatus: status } });
  });
}

/** Records a shipment for a paid order. Changes neither payment nor fulfillment status. */
export async function recordShipment(
  db: Db,
  input: { orderId: string; carrier?: string | null; service?: string | null; trackingNumber?: string | null; trackingUrl?: string | null; status?: ShipmentStatusValue; shippedAt?: Date | null },
) {
  if (input.trackingUrl && !input.trackingUrl.startsWith("https://")) throw new InvalidRequestError("tracking_url_must_be_https");
  return transaction(db, async (tx) => {
    const order = await lockOrder(tx, { id: input.orderId });
    if (!order) throw new OrderNotFoundError(input.orderId);
    if (!PAID_STATES.includes(order.paymentStatus)) throw new OrderNotPaidError();
    return tx.shipment.create({
      data: {
        orderId: input.orderId,
        carrier: input.carrier ?? null,
        service: input.service ?? null,
        trackingNumber: input.trackingNumber ?? null,
        trackingUrl: input.trackingUrl ?? null,
        status: input.status ?? "PENDING",
        shippedAt: input.shippedAt ?? null,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Customer order lookup
// ---------------------------------------------------------------------------

/**
 * Requires BOTH the order number and the checkout email. Returns null for any
 * mismatch or for unpaid orders — callers must answer generically. Returns no
 * address, email or payment identifiers.
 */
export async function lookupOrder(db: Db, orderNumber: string, email: string): Promise<PublicOrderStatus | null> {
  const order = await db.order.findFirst({
    where: {
      orderNumber: orderNumber.trim().toUpperCase(),
      customerEmail: email.trim().toLowerCase(),
      paymentStatus: { in: ["PROCESSING", ...PAID_STATES] },
    },
    select: {
      orderNumber: true,
      createdAt: true,
      paidAt: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      items: { select: { productName: true, variantName: true, quantity: true }, orderBy: { productName: "asc" } },
      shipments: {
        select: { carrier: true, service: true, trackingNumber: true, trackingUrl: true, status: true, shippedAt: true, deliveredAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) return null;
  return {
    orderNumber: order.orderNumber,
    placedAt: (order.paidAt ?? order.createdAt).toISOString(),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    items: order.items,
    shipments: order.shipments.map((s) => ({ ...s, shippedAt: s.shippedAt?.toISOString() ?? null, deliveredAt: s.deliveredAt?.toISOString() ?? null })),
  };
}
