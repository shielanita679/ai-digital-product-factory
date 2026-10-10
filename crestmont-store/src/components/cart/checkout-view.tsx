"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { LockIcon } from "@/components/icons";
import { formatMoney } from "@/config/commerce";

import { useCart } from "./cart-provider";

export type CheckoutShippingInfo = {
  options: { label: string; amountCents: number }[];
  automaticTax: boolean;
  freeThresholdCents: number | null;
};

export function CheckoutView({ enabled, shipping, supportEmail }: { enabled: boolean; shipping: CheckoutShippingInfo; supportEmail: string | null }) {
  const { lines, catalog, subtotal, hydrated } = useCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return <div className="h-64" aria-busy="true" />;

  if (lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink-2">Your cart is empty, so there&rsquo;s nothing to check out yet.</p>
        <Link href="/shop" className="btn-primary mt-6">Browse the shop</Link>
      </div>
    );
  }

  // Mirrors lib/checkout.ts: the first rate becomes free at or above the threshold.
  const options = shipping.options.map((o, i) =>
    i === 0 && shipping.freeThresholdCents !== null && subtotal >= shipping.freeThresholdCents ? { ...o, amountCents: 0 } : o,
  );
  const cheapest = options.length ? Math.min(...options.map((o) => o.amountCents)) : null;

  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "We couldn't start checkout. Please try again.");
      window.location.assign(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't start checkout. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <section className="lg:col-span-7" aria-labelledby="items-heading">
        <h2 id="items-heading" className="font-serif text-2xl">Items</h2>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {lines.map((l) => {
            const item = catalog[l.sku];
            return (
              <li key={l.sku} className="flex gap-4 py-4">
                <Image src={item.image.src} alt={item.image.alt} width={72} height={90} className="h-auto shrink-0 bg-surface" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{item.productName}</p>
                  {item.variantLabel && <p className="text-muted">{item.variantLabel}</p>}
                  <p className="text-muted">
                    {l.quantity} × {formatMoney(item.priceCents)}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">{formatMoney(item.priceCents * l.quantity)}</p>
              </li>
            );
          })}
        </ul>
        <Link href="/cart" className="link mt-4 inline-block text-sm">Edit cart</Link>
      </section>

      <aside className="lg:col-span-5" aria-label="Order summary">
        <div className="border border-line bg-surface p-6">
          <h2 className="font-serif text-2xl">Order summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-ink-2">
              <dt>Shipping</dt>
              <dd className="text-right">
                {options.length === 0
                  ? "Calculated at next step"
                  : options.map((o) => (
                      <span key={o.label} className="block">
                        {o.label}: {o.amountCents === 0 ? "Free" : formatMoney(o.amountCents)}
                      </span>
                    ))}
              </dd>
            </div>
            <div className="flex justify-between gap-4 text-ink-2">
              <dt>Sales tax</dt>
              <dd className="text-right">{shipping.automaticTax ? "Calculated from your shipping address" : "Calculated at next step, where applicable"}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-medium">
              <dt>Estimated total</dt>
              <dd className="tabular-nums">{formatMoney(subtotal + (cheapest ?? 0))}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[0.8125rem] leading-5 text-muted">
            Your final total, including shipping and any applicable tax, is shown on the secure payment page before you confirm. Nothing is charged until you do.
          </p>

          {enabled ? (
            <>
              <button type="button" onClick={startCheckout} disabled={pending} className="btn-primary mt-6 w-full">
                <LockIcon size={16} />
                {pending ? "Opening secure checkout…" : "Continue to secure payment"}
              </button>
              <p className="mt-3 text-[0.8125rem] leading-5 text-muted">
                You&rsquo;ll enter your shipping address and payment details on our payment processor&rsquo;s hosted checkout page. Card details are never sent to or stored on this website.
              </p>
            </>
          ) : (
            <div className="mt-6 border border-notice-ink/20 bg-notice p-4 text-sm text-notice-ink" role="status">
              <p className="font-medium">Online checkout isn&rsquo;t open yet.</p>
              <p className="mt-1">
                We&rsquo;re not accepting payments on the website at the moment, and nothing has been charged. Your cart will be saved on this device.
                {supportEmail && (
                  <>
                    {" "}Questions? Email <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a>.
                  </>
                )}
              </p>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
        </div>
        <p className="mt-4 text-[0.8125rem] text-muted">
          By placing an order you agree to our <Link href="/terms-of-service" className="link">Terms of Service</Link>, <Link href="/return-policy" className="link">Return &amp; Refund Policy</Link> and <Link href="/payment-policy" className="link">Payment Policy</Link>.
        </p>
      </aside>
    </div>
  );
}
