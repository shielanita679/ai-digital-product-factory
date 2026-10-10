import type { Metadata } from "next";
import Link from "next/link";

import { TrackingForm } from "@/components/forms/tracking-form";
import { PageHeader } from "@/components/page-header";
import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { isOrderDatabaseEnabled } from "@/lib/db/config";
import { isContactDeliveryConfigured } from "@/lib/deliver";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Order Tracking",
  description: `Check the status of a ${business.brandName} order using your order number and email address.`,
  path: "/order-tracking",
});

export default function OrderTrackingPage() {
  const lookup = isOrderDatabaseEnabled();
  return (
    <>
      <PageHeader title="Order tracking" crumbs={[{ label: "Order tracking", href: "/order-tracking" }]} />
      <div className="page-x grid gap-14 py-12 sm:py-16 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <h2 className="font-serif text-2xl">Already shipped?</h2>
          <p className="mt-2 text-ink-2">
            When your order ships, we email a shipping confirmation to the address you used at checkout. Tracking information is provided {commerce.trackingPolicy}. The tracking link in that email is the fastest way to see where your package is. Check your spam or promotions folder if you can&rsquo;t find it.
          </p>
          <h2 className="mt-10 font-serif text-2xl">{lookup ? "Check your order status" : "Request an order status update"}</h2>
          <p className="mt-2 mb-6 text-ink-2">
            Enter your order number (it starts with &ldquo;CH-&rdquo; and appears in your confirmation email) and the email you used at checkout.{" "}
            {lookup ? "We'll show the order's current status." : "Our support team will look up the order and email you its current status."}
          </p>
          <TrackingForm available={isOrderDatabaseEnabled() || isContactDeliveryConfigured()} />
        </div>
        <aside className="text-sm lg:col-span-4 lg:col-start-9">
          <div className="border border-line bg-surface p-6">
            <h2 className="font-sans text-base font-semibold">Other order questions</h2>
            <ul className="mt-3 space-y-2 text-ink-2">
              <li>Delivery times and costs: <Link href="/shipping-policy" className="link">Shipping policy</Link></li>
              <li>Lost, late or damaged packages: <Link href="/shipping-policy#delivery-issues" className="link">Delivery issues</Link></li>
              <li>Changing or canceling an order: <Link href="/shipping-policy#order-changes" className="link">Order changes</Link></li>
              <li>Returns: <Link href="/return-policy" className="link">Return &amp; refund policy</Link></li>
              <li>Anything else: <Link href="/contact" className="link">Contact us</Link></li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
