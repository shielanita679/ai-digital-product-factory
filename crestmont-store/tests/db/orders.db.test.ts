/**
 * Order & inventory tests against a REAL MySQL/MariaDB (see harness.ts).
 * Skipped when TEST_DATABASE_URL is not set — they never use a remote or
 * production database.
 *
 *   TEST_DATABASE_URL=mysql://root:PASSWORD@127.0.0.1:3307/mysql npm run test:db
 */
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import * as svc from "@/lib/orders/service";

import { createTestDatabase, hasTestDatabase, inAnHour, item, paidSession, uniqueSku } from "./harness";

describe.skipIf(!hasTestDatabase)("order & inventory service (real MySQL/MariaDB)", () => {
  let db: PrismaClient;
  let drop: () => Promise<void>;

  beforeAll(async () => {
    ({ db, drop } = await createTestDatabase());
  }, 60_000);
  afterAll(async () => {
    await drop?.();
  });

  const session = () => `cs_test_${randomBytes(8).toString("hex")}`;
  const eventId = () => `evt_${randomBytes(8).toString("hex")}`;

  async function seed(sku: string, quantity: number) {
    await svc.registerInventorySku(db, sku, "p-test");
    if (quantity > 0) await svc.adjustInventory(db, { sku, quantityDelta: quantity, type: "INITIAL_STOCK", reason: "test seed" });
  }
  const stock = (sku: string) => db.inventory.findUniqueOrThrow({ where: { sku }, select: { quantityOnHand: true, quantityReserved: true } });
  const sales = (sku: string) => db.inventoryMovement.count({ where: { type: "SALE", inventory: { sku } } });

  async function checkout(items: ReturnType<typeof item>[], sessionId = session()) {
    const o = await svc.createPendingOrder(db, { currency: "USD", items, reservationExpiresAt: inAnHour() });
    await svc.attachCheckoutSession(db, o.orderId, sessionId);
    return { ...o, sessionId };
  }
  const pay = (evt: string, o: { sessionId: string; orderId: string }, subtotal: number, overrides = {}) =>
    svc.handleCheckoutPaid(db, evt, "checkout.session.completed", paidSession(o.sessionId, o.orderId, subtotal, overrides));

  // ------------------------------------------------------------------ reservations
  describe("checkout reservation", () => {
    it("reserves stock without deducting it for an unpaid order", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 2)]);
      expect(o.orderNumber).toMatch(/^CH-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
      expect(await stock(sku)).toEqual({ quantityOnHand: 5, quantityReserved: 2 });
      expect(await sales(sku)).toBe(0);
    });

    it("insufficient stock fails safely: no order, no items, no reservation", async () => {
      const low = uniqueSku();
      const ok = uniqueSku("WHT");
      await seed(low, 1);
      await seed(ok, 5);
      const ordersBefore = await db.order.count();
      await expect(svc.createPendingOrder(db, { currency: "usd", items: [item(ok, 1), item(low, 2)], reservationExpiresAt: inAnHour() })).rejects.toBeInstanceOf(
        svc.InsufficientStockError,
      );
      expect(await db.order.count()).toBe(ordersBefore);
      expect(await db.orderItem.count({ where: { sku: { in: [low, ok] } } })).toBe(0);
      expect(await stock(ok)).toEqual({ quantityOnHand: 5, quantityReserved: 0 });
    });

    it("two customers racing for the last unit: exactly one wins (parallel transactions)", async () => {
      const sku = uniqueSku();
      await seed(sku, 1);
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => svc.createPendingOrder(db, { currency: "usd", items: [item(sku, 1)], reservationExpiresAt: inAnHour() })),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results.filter((r) => r.status === "rejected")) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(svc.InsufficientStockError);
      expect(await stock(sku)).toEqual({ quantityOnHand: 1, quantityReserved: 1 });
    });

    it("rejects zero, negative and fractional quantities, and duplicate SKUs in one order", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      for (const q of [0, -3, 1.5]) {
        await expect(svc.createPendingOrder(db, { currency: "usd", items: [item(sku, q)], reservationExpiresAt: inAnHour() })).rejects.toThrow(/invalid_quantity/);
      }
      await expect(svc.createPendingOrder(db, { currency: "usd", items: [item(sku, 1), item(sku, 1)], reservationExpiresAt: inAnHour() })).rejects.toThrow(/duplicate_sku/);
      await expect(svc.adjustInventory(db, { sku, quantityDelta: 0, type: "MANUAL_ADJUSTMENT", reason: "x" })).rejects.toThrow(/invalid_quantity/);
      expect(await stock(sku)).toEqual({ quantityOnHand: 5, quantityReserved: 0 });
    });
  });

  // ------------------------------------------------------------------ idempotency
  describe("Stripe webhook idempotency", () => {
    it("a duplicate event cannot create a duplicate order or reduce stock twice", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 2)]);
      const evt = eventId();
      expect((await pay(evt, o, 5998)).result).toBe("paid");
      expect((await pay(evt, o, 5998)).result).toBe("duplicate");
      expect(await db.order.count({ where: { stripeCheckoutSessionId: o.sessionId } })).toBe(1);
      expect(await sales(sku)).toBe(1);
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 0 });
      expect(await db.stripeEvent.count({ where: { stripeEventId: evt } })).toBe(1);
    });

    it("the same event delivered concurrently is processed exactly once", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 2)]);
      const evt = eventId();
      const results = await Promise.all(Array.from({ length: 6 }, () => pay(evt, o, 5998)));
      expect(results.filter((r) => r.result === "paid")).toHaveLength(1);
      expect(results.filter((r) => r.result === "duplicate")).toHaveLength(5);
      expect(await sales(sku)).toBe(1);
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 0 });
    });

    it("a different success event for an already-paid session does not deduct again", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 2)]);
      await pay(eventId(), o, 5998);
      const r = await svc.handleCheckoutPaid(db, eventId(), "checkout.session.async_payment_succeeded", paidSession(o.sessionId, o.orderId, 5998));
      expect(r.result).toBe("already_paid");
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 0 });
    });

    it("the ledger rejects a second SALE for the same order and SKU (unique sale_key)", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      await pay(eventId(), o, 2999);
      const inv = await db.inventory.findUniqueOrThrow({ where: { sku } });
      await expect(
        db.inventoryMovement.create({
          data: { inventoryId: inv.id, orderId: o.orderId, type: "SALE", quantityDelta: -1, quantityOnHandAfter: 3, saleKey: `${o.orderId}:${inv.id}` },
        }),
      ).rejects.toThrow();
    });

    it("a failed event rolls back completely and is processed exactly once on retry", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const sid = session();
      const evt = eventId();
      // First delivery: no order linked to this session yet → whole transaction rolls back.
      await expect(pay(evt, { sessionId: sid, orderId: "00000000-0000-0000-0000-000000000000" }, 2999)).rejects.toBeInstanceOf(svc.OrderNotFoundError);
      await svc.recordStripeEventFailure(db, evt, "checkout.session.completed", "order not found");
      expect((await db.stripeEvent.findUniqueOrThrow({ where: { stripeEventId: evt } })).status).toBe("FAILED");
      expect(await stock(sku)).toEqual({ quantityOnHand: 5, quantityReserved: 0 });

      const o = await checkout([item(sku, 1)], sid);
      expect((await pay(evt, o, 2999)).result).toBe("paid");
      expect((await pay(evt, o, 2999)).result).toBe("duplicate");
      expect(await db.stripeEvent.findUniqueOrThrow({ where: { stripeEventId: evt }, select: { status: true, attempts: true } })).toEqual({ status: "PROCESSED", attempts: 2 });
      expect(await stock(sku)).toEqual({ quantityOnHand: 4, quantityReserved: 0 });
    });

    it("recording a failure never downgrades a processed event", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      const evt = eventId();
      await pay(evt, o, 2999);
      await svc.recordStripeEventFailure(db, evt, "checkout.session.completed", "late duplicate error");
      expect((await db.stripeEvent.findUniqueOrThrow({ where: { stripeEventId: evt } })).status).toBe("PROCESSED");
    });

    it("stores customer, shipping and Stripe amounts; email is normalized", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 2)]);
      await pay(eventId(), o, 5998);
      const row = await db.order.findUniqueOrThrow({ where: { id: o.orderId } });
      expect(row).toMatchObject({
        paymentStatus: "PAID",
        fulfillmentStatus: "UNFULFILLED",
        customerEmail: "buyer@example.test",
        shippingCountry: "US",
        subtotalAmount: 5998,
        shippingAmount: 500,
        totalAmount: 6498,
        reservationStatus: "CONVERTED",
        requiresReview: false,
      });
      expect(row.paidAt).not.toBeNull();
    });

    it("flags a paid order for review when Stripe's subtotal doesn't match the snapshot", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      expect((await pay(eventId(), o, 100)).result).toBe("paid_requires_review");
      expect(await db.order.findUniqueOrThrow({ where: { id: o.orderId }, select: { requiresReview: true, fulfillmentStatus: true } })).toEqual({
        requiresReview: true,
        fulfillmentStatus: "ON_HOLD",
      });
    });
  });

  // ------------------------------------------------------------------ negative stock
  describe("stock can never go negative", () => {
    it("is enforced by database CHECK constraints", async () => {
      const sku = uniqueSku();
      await seed(sku, 1);
      await expect(db.$executeRaw`UPDATE inventory SET quantity_on_hand = -1 WHERE sku = ${sku}`).rejects.toThrow(/inventory_on_hand_non_negative|constraint/i);
      await expect(db.$executeRaw`UPDATE inventory SET quantity_reserved = 2 WHERE sku = ${sku}`).rejects.toThrow(/inventory_reserved_within_on_hand|constraint/i);
      await expect(db.$executeRaw`UPDATE inventory SET quantity_reserved = -1 WHERE sku = ${sku}`).rejects.toThrow(/inventory_reserved_non_negative|constraint/i);
      expect(await stock(sku)).toEqual({ quantityOnHand: 1, quantityReserved: 0 });
    });

    it("an adjustment below zero, or below reserved stock, fails", async () => {
      const sku = uniqueSku();
      await seed(sku, 2);
      await checkout([item(sku, 1)]);
      await expect(svc.adjustInventory(db, { sku, quantityDelta: -2, type: "MANUAL_ADJUSTMENT", reason: "count" })).rejects.toBeInstanceOf(svc.InsufficientStockError);
      await expect(svc.adjustInventory(db, { sku, quantityDelta: -5, type: "MANUAL_ADJUSTMENT", reason: "count" })).rejects.toBeInstanceOf(svc.InsufficientStockError);
      expect(await stock(sku)).toEqual({ quantityOnHand: 2, quantityReserved: 1 });
    });

    it("a paid order whose reservation was lost never pushes stock negative; it is flagged for review", async () => {
      const sku = uniqueSku();
      await seed(sku, 1);
      const o = await checkout([item(sku, 1)]);
      await svc.handleCheckoutClosed(db, eventId(), "checkout.session.expired", o.sessionId, "EXPIRED");
      await db.order.update({ where: { id: o.orderId }, data: { paymentStatus: "PENDING" } }); // simulate a late payment
      await svc.adjustInventory(db, { sku, quantityDelta: -1, type: "MANUAL_ADJUSTMENT", reason: "damaged in storage" });
      expect((await pay(eventId(), o, 2999)).result).toBe("paid_requires_review");
      expect(await stock(sku)).toEqual({ quantityOnHand: 0, quantityReserved: 0 });
      expect(await sales(sku)).toBe(0);
    });
  });

  // ------------------------------------------------------------------ expiry & failure
  describe("expiry, failure and cancellation", () => {
    it("expired checkout releases the reservation and never deducts stock; duplicates are no-ops", async () => {
      const sku = uniqueSku();
      await seed(sku, 3);
      const o = await checkout([item(sku, 2)]);
      const evt = eventId();
      expect((await svc.handleCheckoutClosed(db, evt, "checkout.session.expired", o.sessionId, "EXPIRED")).result).toBe("expired");
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 0 });
      expect((await svc.handleCheckoutClosed(db, evt, "checkout.session.expired", o.sessionId, "EXPIRED")).result).toBe("duplicate");
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 0 });
    });

    it("delayed payment: processing keeps the reservation; failure releases it", async () => {
      const sku = uniqueSku();
      await seed(sku, 3);
      const o = await checkout([item(sku, 1)]);
      await svc.handleCheckoutProcessing(db, eventId(), "checkout.session.completed", o.sessionId, new Date(Date.now() + 10 * 86_400_000));
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 1 });
      await svc.handleCheckoutClosed(db, eventId(), "checkout.session.async_payment_failed", o.sessionId, "FAILED");
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 0 });
      expect((await db.order.findUniqueOrThrow({ where: { id: o.orderId } })).paymentStatus).toBe("FAILED");
    });

    it("the sweeper releases only overdue pending reservations", async () => {
      const sku = uniqueSku();
      await seed(sku, 3);
      const overdue = await checkout([item(sku, 1)]);
      await checkout([item(sku, 1)]);
      await db.order.update({ where: { id: overdue.orderId }, data: { reservationExpiresAt: new Date(Date.now() - 60_000) } });
      expect(await svc.releaseExpiredReservations(db)).toBeGreaterThanOrEqual(1);
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 1 });
      expect((await db.order.findUniqueOrThrow({ where: { id: overdue.orderId } })).paymentStatus).toBe("EXPIRED");
    });

    it("cancelPendingOrder releases stock and never touches a paid order", async () => {
      const sku = uniqueSku();
      await seed(sku, 3);
      const pending = await checkout([item(sku, 1)]);
      await svc.cancelPendingOrder(db, pending.orderId);
      expect(await stock(sku)).toEqual({ quantityOnHand: 3, quantityReserved: 0 });

      const paid = await checkout([item(sku, 1)]);
      await pay(eventId(), paid, 2999);
      await svc.cancelPendingOrder(db, paid.orderId);
      expect((await db.order.findUniqueOrThrow({ where: { id: paid.orderId } })).paymentStatus).toBe("PAID");
    });
  });

  // ------------------------------------------------------------------ refunds
  describe("refunds are money, not stock", () => {
    it("a refund does not restock inventory or change fulfillment", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 2)]);
      await pay(eventId(), o, 5998);
      const before = await stock(sku);
      expect((await svc.recordRefund(db, eventId(), "charge.refunded", `pi_${o.sessionId.slice(3)}`, 6498)).result).toBe("refund_recorded");
      expect(await stock(sku)).toEqual(before);
      expect(await db.inventoryMovement.count({ where: { orderId: o.orderId, type: { in: ["REFUND_RESTOCK", "RETURN_RESTOCK", "CANCELLATION_RESTOCK"] } } })).toBe(0);
      expect(await db.order.findUniqueOrThrow({ where: { id: o.orderId }, select: { paymentStatus: true, fulfillmentStatus: true, refundedAmount: true } })).toEqual({
        paymentStatus: "REFUNDED",
        fulfillmentStatus: "UNFULFILLED",
        refundedAmount: 6498,
      });
    });

    it("restocking is a separate explicit step and can't exceed what was sold", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 2)]);
      await pay(eventId(), o, 5998);
      await svc.adjustInventory(db, { sku, quantityDelta: 1, type: "RETURN_RESTOCK", reason: "returned unopened", orderId: o.orderId });
      await expect(svc.adjustInventory(db, { sku, quantityDelta: 2, type: "RETURN_RESTOCK", reason: "again", orderId: o.orderId })).rejects.toThrow(/restock_exceeds_sold_quantity/);
      expect(await stock(sku)).toEqual({ quantityOnHand: 4, quantityReserved: 0 });
    });

    it("sales can't be recorded through adjustInventory", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      // @ts-expect-error SALE is deliberately excluded from the type, and rejected at runtime too
      await expect(svc.adjustInventory(db, { sku, quantityDelta: -1, type: "SALE", reason: "x" })).rejects.toThrow(/invalid_movement_type/);
    });
  });

  // ------------------------------------------------------------------ fulfillment
  describe("payment and fulfillment are independent", () => {
    it("payment leaves the order unfulfilled; a shipment changes neither status", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      await pay(eventId(), o, 2999);
      await svc.recordShipment(db, { orderId: o.orderId, status: "LABEL_CREATED" });
      expect(await db.order.findUniqueOrThrow({ where: { id: o.orderId }, select: { paymentStatus: true, fulfillmentStatus: true } })).toEqual({
        paymentStatus: "PAID",
        fulfillmentStatus: "UNFULFILLED",
      });
    });

    it("an unpaid order cannot be fulfilled or shipped (service and database)", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      await expect(svc.setFulfillmentStatus(db, o.orderId, "FULFILLED")).rejects.toBeInstanceOf(svc.OrderNotPaidError);
      await expect(svc.recordShipment(db, { orderId: o.orderId })).rejects.toBeInstanceOf(svc.OrderNotPaidError);
      await expect(db.order.update({ where: { id: o.orderId }, data: { fulfillmentStatus: "FULFILLED" } })).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------------ integrity
  describe("integrity constraints", () => {
    it("rejects duplicate SKUs", async () => {
      const sku = uniqueSku();
      await seed(sku, 0);
      await expect(svc.registerInventorySku(db, sku, "p-test")).rejects.toThrow();
      await expect(svc.registerInventorySku(db, "not-a-sku", "p-test")).rejects.toThrow(/invalid_sku/);
    });

    it("order numbers are unique and well-formed", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      await expect(db.order.create({ data: { orderNumber: o.orderNumber, currency: "usd", reservationExpiresAt: inAnHour() } })).rejects.toThrow();
      await expect(db.order.create({ data: { orderNumber: "CH-0001-0001", currency: "usd", reservationExpiresAt: inAnHour() } })).rejects.toThrow();
      await expect(db.order.create({ data: { orderNumber: "ch-abcd-efgh", currency: "usd", reservationExpiresAt: inAnHour() } })).rejects.toThrow();
    });

    it("order items keep their purchase snapshot when the catalog changes", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 2, 2999, { productName: "Original Name" })]);
      await pay(eventId(), o, 5998);
      await checkout([item(sku, 1, 3499, { productName: "Renamed Product" })]); // later catalog state
      expect(await db.orderItem.findFirstOrThrow({ where: { orderId: o.orderId }, select: { productName: true, unitAmount: true, lineAmount: true } })).toEqual({
        productName: "Original Name",
        unitAmount: 2999,
        lineAmount: 5998,
      });
    });

    it("order-item arithmetic is enforced by the database", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      await expect(db.orderItem.update({ where: { orderId_sku: { orderId: o.orderId, sku } }, data: { lineAmount: 1 } })).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------------ lookup
  describe("customer order lookup", () => {
    it("requires both order number and email, and returns no personal data", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      await pay(eventId(), o, 2999);
      const found = await svc.lookupOrder(db, o.orderNumber.toLowerCase(), " BUYER@example.test ");
      expect(found).toMatchObject({ orderNumber: o.orderNumber, paymentStatus: "PAID", fulfillmentStatus: "UNFULFILLED" });
      expect(JSON.stringify(found)).not.toMatch(/Test St|63105|buyer@|pi_|cs_/);
      expect(await svc.lookupOrder(db, o.orderNumber, "someone@else.test")).toBeNull();
      expect(await svc.lookupOrder(db, "CH-ZZZZ-ZZZZ", "buyer@example.test")).toBeNull();
    });

    it("does not reveal unpaid orders", async () => {
      const sku = uniqueSku();
      await seed(sku, 5);
      const o = await checkout([item(sku, 1)]);
      await db.order.update({ where: { id: o.orderId }, data: { customerEmail: "buyer@example.test" } });
      expect(await svc.lookupOrder(db, o.orderNumber, "buyer@example.test")).toBeNull();
    });
  });
});
