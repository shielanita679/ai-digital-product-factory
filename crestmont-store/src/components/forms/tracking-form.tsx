"use client";

import { Honeypot, UnavailableNotice, useSubmit } from "./use-submit";

export function TrackingForm({ available }: { available: boolean }) {
  const { state, submit } = useSubmit("/api/order-tracking");

  if (state.status === "success") {
    return (
      <div className="border border-line bg-surface p-6" role="status">
        <h2 className="font-serif text-2xl">Request received</h2>
        <p className="mt-2 text-ink-2">{state.message}</p>
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
