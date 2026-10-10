import "server-only";

import { getDatabase } from "@/lib/db/prisma";

import * as service from "./service";
import type { PaidSessionInput, PendingOrderItem, PublicOrderStatus } from "./types";

/**
 * Server-only entry point to the order & inventory service, bound to the
 * production database. Routes call these; no component contains queries.
 */
export { InsufficientStockError } from "./service";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("Crestmont order database is not configured");
  }
}

function db() {
  const client = getDatabase();
  if (!client) throw new DatabaseNotConfiguredError();
  return client;
}

export const createPendingOrder = (currency: string, items: PendingOrderItem[], reservationExpiresAt: Date) =>
  service.createPendingOrder(db(), { currency, items, reservationExpiresAt });
export const attachCheckoutSession = (orderId: string, sessionId: string) => service.attachCheckoutSession(db(), orderId, sessionId);
export const cancelPendingOrder = (orderId: string) => service.cancelPendingOrder(db(), orderId);
export const handleCheckoutPaid = (eventId: string, eventType: string, session: PaidSessionInput) => service.handleCheckoutPaid(db(), eventId, eventType, session);
export const handleCheckoutProcessing = (eventId: string, eventType: string, sessionId: string, holdUntil: Date) =>
  service.handleCheckoutProcessing(db(), eventId, eventType, sessionId, holdUntil);
export const handleCheckoutClosed = (eventId: string, eventType: string, sessionId: string, outcome: "EXPIRED" | "FAILED") =>
  service.handleCheckoutClosed(db(), eventId, eventType, sessionId, outcome);
export const recordRefund = (eventId: string, eventType: string, paymentIntentId: string, amountRefunded: number) =>
  service.recordRefund(db(), eventId, eventType, paymentIntentId, amountRefunded);
export const recordIgnoredStripeEvent = (eventId: string, eventType: string) => service.recordIgnoredStripeEvent(db(), eventId, eventType);
export const recordStripeEventFailure = (eventId: string, eventType: string, message: string) => service.recordStripeEventFailure(db(), eventId, eventType, message);
export const releaseExpiredReservations = () => service.releaseExpiredReservations(db());
export const lookupOrder = (orderNumber: string, email: string): Promise<PublicOrderStatus | null> => service.lookupOrder(db(), orderNumber, email);
