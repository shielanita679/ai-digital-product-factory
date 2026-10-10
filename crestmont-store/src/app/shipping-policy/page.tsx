import type { Metadata } from "next";
import Link from "next/link";

import { PolicyContact, PolicyLayout } from "@/components/policy-layout";
import { Setting } from "@/components/setting";
import { business } from "@/config/business";
import { commerce, formatMoney } from "@/config/commerce";
import { carrierPhrase, deliveryDisclaimer, requiredInfoPhrase, resolutionsPhrase } from "@/lib/policy-text";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Shipping Policy",
  description: `Order processing, estimated delivery times, shipping costs, tracking and delivery issues for ${business.brandName} orders.`,
  path: "/shipping-policy",
});

export default function ShippingPolicyPage() {
  const rates = commerce.shippingRates;
  const threshold = commerce.freeShippingThresholdCents;
  const d = commerce.damagedOrIncorrect;

  return (
    <PolicyLayout
      title="Shipping Policy"
      path="/shipping-policy"
      intro={<p>This policy explains how {business.legalName} (&ldquo;{business.brandName}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) processes and ships orders placed on this website.</p>}
    >
      <h2>Processing time and delivery time</h2>
      <p>Getting an order to you happens in two stages, and the estimates below apply to each stage separately:</p>
      <ul>
        <li>
          <strong>Processing time</strong> — preparing your order and handing it to the shipping service: <strong><Setting value={commerce.processingTime} label="processing time" /></strong>. Orders are processed only after payment is confirmed. Business days exclude weekends and U.S. federal holidays.
        </li>
        <li>
          <strong>Estimated delivery time</strong> — transit after dispatch, within the United States: typically <strong><Setting value={commerce.domesticDeliveryEstimate} label="delivery estimate" /></strong>.
        </li>
      </ul>
      <p>{deliveryDisclaimer} Weather, shipping-service volume, address problems and other events outside our control can cause delays. If we expect a significant delay in processing your order, we will email you.</p>

      <h2>Where we ship</h2>
      {commerce.international.enabled ? (
        <p>We ship to addresses in the United States and to the countries offered at checkout.</p>
      ) : (
        <p>We currently ship to addresses within the United States only. International shipping is not available at this time, and checkout will not accept addresses outside the United States.</p>
      )}
      <h3>P.O. boxes and military addresses</h3>
      {commerce.poBoxAndMilitaryAddresses === "supported" ? (
        <p>We can ship to P.O. boxes and APO/FPO/DPO addresses, though some shipping options may not be available for them.</p>
      ) : commerce.poBoxAndMilitaryAddresses === "not_supported" ? (
        <p>We are not able to ship to P.O. boxes or APO/FPO/DPO addresses.</p>
      ) : (
        <p>We can&rsquo;t currently promise delivery to P.O. boxes or APO/FPO/DPO addresses. If you need to use one, please <Link href="/contact">contact us</Link> before ordering.</p>
      )}

      <h2>Shipping costs</h2>
      {rates.length > 0 ? (
        <>
          <p>The following shipping options are currently offered:</p>
          <ul>
            {rates.map((r) => (
              <li key={r.id}>
                {r.label}: {r.amountCents === 0 ? "Free" : formatMoney(r.amountCents)}
                {r.deliveryDays && ` (estimated ${r.deliveryDays.min}–${r.deliveryDays.max} business days after dispatch)`}
              </li>
            ))}
          </ul>
          {threshold !== null && <p>Orders with a merchandise subtotal of {formatMoney(threshold)} or more qualify for free standard shipping.</p>}
        </>
      ) : null}
      <p>Shipping costs are calculated and displayed at checkout, based on the shipping method, before you pay. We do not add shipping charges after an order is placed.</p>

      <h2>Tracking</h2>
      <p>
        When your order ships, we email a shipping confirmation to the address used at checkout. Orders are shipped with {carrierPhrase()}, and tracking information is provided {commerce.trackingPolicy}. Orders containing several items may arrive in more than one package. You can also request a status update from our <Link href="/order-tracking">order tracking page</Link>.
      </p>

      <h2 id="order-changes">Cancellations and address changes</h2>
      <p>
        You may request a cancellation or a shipping-address change {commerce.orderChangeCutoff}. Please contact us as soon as possible with your order number. Once an order has been processed for shipment, it may no longer be possible to cancel it or change the address, so we can&rsquo;t guarantee that every request can be completed. If an order can&rsquo;t be canceled, it may be eligible for return under our <Link href="/return-policy">Return &amp; Refund Policy</Link>.
      </p>
      <p>Please check your shipping address carefully at checkout. If a package is returned to us because the address was incorrect or incomplete, or because it was refused or unclaimed, we will contact you about the options.</p>

      <h2 id="delivery-issues">Delivery issues</h2>
      <h3>Delayed packages</h3>
      <p>If your tracking information hasn&rsquo;t updated for several business days, or your package is well past its estimated delivery time, contact us and we will look into it with the shipping service.</p>
      <h3>Packages marked delivered but not received</h3>
      <p>Please check around your property and with neighbors or building management, and allow one business day, as packages are sometimes marked delivered early. If it still hasn&rsquo;t arrived, contact us and we will investigate with the shipping service.</p>
      <h3>Damaged or incorrect items</h3>
      <p>
        If your order arrives damaged or you receive the wrong item, contact us <strong>{d.reportWindow}</strong> with {requiredInfoPhrase()}. Depending on the circumstances and product availability, support may offer {resolutionsPhrase()}. A replacement depends on the item being available. Full details are in our <Link href="/return-policy#damaged-or-incorrect">Return &amp; Refund Policy</Link>.
      </p>

      <h2>Customs, duties and import taxes</h2>
      {commerce.international.enabled ? (
        <p>International orders may be subject to import duties, taxes and customs fees charged by the destination country. Unless stated otherwise at checkout, these charges are not included in your order total and are the responsibility of the recipient.</p>
      ) : (
        <p>We do not currently ship outside the United States, so customs duties and import taxes do not apply to orders from this website.</p>
      )}

      <h2>Contact</h2>
      <PolicyContact />
    </PolicyLayout>
  );
}
