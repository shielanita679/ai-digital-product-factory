import type { Metadata } from "next";

import { CheckoutView } from "@/components/cart/checkout-view";
import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { isCheckoutEnabled } from "@/lib/launch";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Checkout", description: "Review your order and continue to secure payment.", path: "/checkout" }),
  robots: { index: false, follow: false },
};

// Readiness depends on runtime environment variables.
export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  return (
    <div className="page-x py-10 sm:py-14">
      <h1 className="mb-8 text-4xl sm:text-5xl">Checkout</h1>
      <CheckoutView
        enabled={isCheckoutEnabled()}
        supportEmail={business.supportEmail}
        shipping={{
          options: commerce.shippingRates.map((r) => ({ label: r.label, amountCents: r.amountCents })),
          automaticTax: process.env.STRIPE_AUTOMATIC_TAX === "true",
          freeThresholdCents: commerce.freeShippingThresholdCents,
        }}
      />
    </div>
  );
}
