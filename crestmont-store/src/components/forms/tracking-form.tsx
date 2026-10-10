"use client";

import type { PublicOrderStatus } from "@/lib/orders/types";

import { Honeypot, UnavailableNotice, useSubmit } from "./use-submit";

const paymentLabel: Record<PublicOrderStatus["paymentStatus"], string> = {
  PENDING: "Awaiting payment",
  PROCESSING: "Payment processing",
  PAID: "Paid",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  FAILED: "Payment failed",
  EXPIRED: "Checkout expired",
  CANCELLED: "Cancelled",
};
const fulfillmentLabel: Record<PublicOrderStatus["fulfillmentStatus"], string> = {
  UNFULFILLED: "Being prepared",
  ON_HOLD: "On hold — our support team will contact you",
  PARTIALLY_FULFILLED: "Partially shipped",
  FULFILLED: "Shipped",
  CANCELLED: "Cancelled",
};

function OrderStatusView({ order }: { order: PublicOrderStatus }) {
  return (
    <dl className="mt-4 grid gap-3 text-sm">
      <div><dt className="text-muted">Payment</dt><dd>{paymentLabel[order.paymentStatus]}</dd></div>
      <div><dt className="text-muted">Fulfillment</dt><dd>{fulfillmentLabel[order.fulfillmentStatus]}</dd></div>
      <div>
        <dt className="text-muted">Items</dt>
        <dd>
          <ul>
            {order.items.map((i) => (
              <li key={`${i.productName}-${i.variantName}`}>{i.quantity} × {i.productName}{i.variantName ? ` (${i.variantName})` : ""}</li>
            ))}
          </ul>
        </dd>
      </div>
      {order.shipments.length > 0 && (
        <div>
          <dt className="text-muted">Shipments</dt>
          <dd>
            <ul className="space-y-1">
              {order.shipments.map((s, idx) => (
                <li key={s.trackingNumber ?? idx}>
                  {[s.carrier, s.service].filter(Boolean).join(" ") || "Shipment"} — {s.status.replace(/_/g, " ").toLowerCase()}
                  {s.trackingUrl && s.trackingNumber && (
                    <> · <a href={s.trackingUrl} className="link" rel="noopener noreferrer" target="_blank">{s.trackingNumber}</a></>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  );
}

export function TrackingForm({ available }: { available: boolean }) {
  const { state, submit } = useSubmit("/api/order-tracking");

  if (state.status === "success") {
    return (
      <div className="border border-line bg-surface p-6" role="status">
        <h2 className="font-serif text-2xl">{state.data ? "Order status" : "Request received"}</h2>
        <p className="mt-2 text-ink-2">{state.message}</p>
        {state.data ? <OrderStatusView order={state.data as PublicOrderStatus} /> : null}
      </div>
    );
  }

  return (
    <form
      className="relative grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        await submit(e.currentTarget);
      }}
    >
      <Honeypot />
      {!available && <UnavailableNotice id="tracking-unavailable" />}
      <fieldset disabled={!available} className="contents">
      <div>
        <label htmlFor="t-order" className="field-label">Order number</label>
        <input id="t-order" name="orderNumber" required maxLength={40} className="field" placeholder="As shown in your confirmation email" />
      </div>
      <div>
        <label htmlFor="t-email" className="field-label">Email used at checkout</label>
        <input id="t-email" name="email" type="email" required autoComplete="email" maxLength={254} className="field" />
      </div>
      {state.status === "error" && <p className="text-sm text-danger" role="alert">{state.message}</p>}
      <button type="submit" className="btn-primary w-full sm:w-auto sm:justify-self-start" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? "Submitting…" : "Request order status"}
      </button>
      </fieldset>
    </form>
  );
}
