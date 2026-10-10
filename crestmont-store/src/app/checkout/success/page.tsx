import type { Metadata } from "next";
import Link from "next/link";
import type Stripe from "stripe";

import { ClearCart } from "@/components/cart/clear-cart";
import { CheckIcon } from "@/components/icons";
import { Setting } from "@/components/setting";
import { business } from "@/config/business";
import { commerce, formatMoney } from "@/config/commerce";
import { getStripe } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Display only. Reaching this page proves nothing about payment and changes
 * nothing: orders are marked paid and stock is deducted solely by the
 * verified Stripe webhook.
 */
async function loadSession(id: string | undefined): Promise<Stripe.Checkout.Session | null> {
  const stripe = getStripe();
  if (!stripe || !id || !/^cs_(test|live)_[A-Za-z0-9]{10,250}$/.test(id)) return null;
  try {
    return await stripe.checkout.sessions.retrieve(id, { expand: ["line_items"] });
  } catch {
    return null;
  }
}

export default async function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const raw = (await searchParams).session_id;
  const session = await loadSession(typeof raw === "string" ? raw : undefined);

  if (!session || (session.payment_status !== "paid" && session.payment_status !== "no_payment_required" && session.status !== "complete")) {
    return (
      <div className="page-x max-w-2xl py-16 sm:py-24">
        <h1 className="text-4xl">We couldn&rsquo;t find that order</h1>
        <p className="mt-4 text-ink-2">
          This confirmation link is missing or has expired. If you completed a payment, your receipt and order confirmation will arrive by email. If you need help, <Link href="/contact" className="link">contact us</Link>.
        </p>
        <Link href="/shop" className="btn-primary mt-8">Continue shopping</Link>
      </div>
    );
  }

  const reference = session.metadata?.order_reference ?? session.client_reference_id ?? session.id;
  const paid = session.payment_status === "paid";
  const items = session.line_items?.data ?? [];
  const currency = (session.currency ?? commerce.currency).toUpperCase();
  const fmt = (cents: number | null | undefined) => (currency === commerce.currency ? formatMoney(cents ?? 0) : `${((cents ?? 0) / 100).toFixed(2)} ${currency}`);

  return (
    <div className="page-x max-w-3xl py-14 sm:py-20">
      {paid && <ClearCart />}
      <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent"><CheckIcon /></span>
      <h1 className="mt-6 text-4xl sm:text-5xl">{paid ? "Thank you for your order" : "Your order is being processed"}</h1>
      <p className="mt-4 text-ink-2">
        {paid ? "Your payment was successful." : "We'll email you when your payment is confirmed."} Your order number is <strong className="font-medium text-ink">{reference}</strong>
        {session.customer_details?.email && <> and a confirmation will be sent to <strong className="font-medium text-ink">{session.customer_details.email}</strong></>}.
      </p>

      <div className="mt-10 border border-line">
        <ul className="divide-y divide-line">
          {items.map((li) => (
            <li key={li.id} className="flex justify-between gap-4 px-5 py-4 text-sm">
              <span>
                {li.description} <span className="text-muted">× {li.quantity}</span>
              </span>
              <span className="tabular-nums">{fmt(li.amount_subtotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 border-t border-line bg-surface px-5 py-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{fmt(session.amount_subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Shipping</dt><dd className="tabular-nums">{fmt(session.total_details?.amount_shipping)}</dd></div>
          <div className="flex justify-between"><dt>Tax</dt><dd className="tabular-nums">{fmt(session.total_details?.amount_tax)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-medium"><dt>Total paid</dt><dd className="tabular-nums">{fmt(session.amount_total)}</dd></div>
        </dl>
      </div>

      <h2 className="mt-12 text-2xl">What happens next</h2>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-ink-2">
        <li>We prepare your order for shipment within <Setting value={commerce.processingTime} label="processing time" />.</li>
        <li>When it ships, we&rsquo;ll email you the shipping details.</li>
        <li>Need to change something? Contact us right away with your order number at {business.supportEmail ? <a href={`mailto:${business.supportEmail}`} className="link">{business.supportEmail}</a> : <Link href="/contact" className="link">our contact page</Link>}.</li>
      </ol>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href="/shop" className="btn-primary">Continue shopping</Link>
        <Link href="/order-tracking" className="btn-ghost">Order tracking</Link>
      </div>
    </div>
  );
}
