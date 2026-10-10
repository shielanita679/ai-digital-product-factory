import type { Metadata } from "next";
import Link from "next/link";

import { PolicyContact, PolicyLayout } from "@/components/policy-layout";
import { Setting } from "@/components/setting";
import { business } from "@/config/business";
import { commerce, formatMoney } from "@/config/commerce";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Shipping Policy",
  description: `Order processing times, delivery estimates, shipping costs, tracking and delivery issues for ${business.brandName} orders.`,
  path: "/shipping-policy",
});

export default function ShippingPolicyPage() {
  const rates = commerce.shippingRates;
  const threshold = commerce.freeShippingThresholdCents;

  return (
    <PolicyLayout
      title="Shipping Policy"
      path="/shipping-policy"
      intro={<p>This policy explains how {business.legalName} (&ldquo;{business.brandName}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) processes and ships orders placed on this website.</p>}
    >
      <h2>Order processing</h2>
      <p>
        Orders are processed only after payment is confirmed. We prepare and hand orders to the carrier within <strong><Setting value={commerce.processingTime} label="processing time" /></strong>, excluding weekends and U.S. federal holidays. During busy periods or when an item requires extra handling, processing may take longer; if we expect a significant delay we will email you.
      </p>

      <h2>Where we ship</h2>
      {commerce.international.enabled ? (
        <p>We ship to addresses in the United States and to the countries offered at checkout. If your country isn&rsquo;t listed at checkout, we can&rsquo;t currently ship there.</p>
      ) : (
        <p>We currently ship to addresses within the United States only. Checkout will not accept shipping addresses outside the countries we serve.</p>
      )}
      <p>
        P.O. boxes and APO/FPO/DPO addresses:{" "}
        {commerce.shipsToPOBoxes === null ? (
          <Setting value={null} label="P.O. box policy" />
        ) : commerce.shipsToPOBoxes ? (
          "we can ship to these addresses, though some shipping options may not be available."
        ) : (
          "we are not able to ship to these addresses at this time."
        )}
      </p>

      <h2>Delivery estimates</h2>
      <p>
        <strong>Domestic (United States):</strong> typically <Setting value={commerce.domesticDeliveryEstimate} label="domestic delivery estimate" /> after the order ships.
      </p>
      {commerce.international.enabled && (
        <p>
          <strong>International:</strong> typically <Setting value={commerce.international.deliveryEstimate} label="international delivery estimate" /> after the order ships.
        </p>
      )}
      <p>
        Delivery estimates are provided by our carriers and are not guaranteed. Weather, carrier volume, address problems and other events outside our control can cause delays.
      </p>

      <h2>Shipping costs</h2>
      {rates.length > 0 ? (
        <>
          <p>The following shipping options are currently offered for orders to the United States:</p>
          <ul>
            {rates.map((r) => (
              <li key={r.id}>
                {r.label}: {formatMoney(r.amountCents)}
                {r.deliveryDays && ` (estimated ${r.deliveryDays.min}–${r.deliveryDays.max} business days after dispatch)`}
              </li>
            ))}
          </ul>
          {threshold !== null && <p>Orders with a merchandise subtotal of {formatMoney(threshold)} or more qualify for free standard shipping.</p>}
        </>
      ) : (
        <p>
          Shipping rates: <Setting value={null} label="shipping rates" />.
        </p>
      )}
      <p>The shipping options and exact cost for your order are always shown at checkout before you pay. We do not add shipping charges after an order is placed.</p>

      <h2>Carriers and tracking</h2>
      <p>
        We ship with <Setting value={commerce.carriers} label="carriers" />. When your order ships, we email a shipping confirmation to the address used at checkout, including tracking details when the carrier provides them. Orders containing several items may arrive in more than one package, each with its own tracking number. You can also request an update from our <Link href="/order-tracking">order tracking page</Link>.
      </p>

      <h2 id="order-changes">Address changes and cancellations</h2>
      <p>
        Please check your shipping address carefully at checkout. If you need to change the address or cancel your order, contact us as soon as possible. We can usually make changes <Setting value={commerce.orderChangeWindow} label="order change window" />. Once an order has been handed to the carrier, we can no longer change the address or cancel it; you may be able to request a return instead under our <Link href="/return-policy">Return &amp; Refund Policy</Link>.
      </p>
      <p>
        If a package is returned to us because the address provided was incorrect or incomplete, or because it was refused or unclaimed, we will contact you. Reshipping may require payment of an additional shipping charge.
      </p>

      <h2 id="delivery-issues">Delivery issues</h2>
      <h3>Delayed packages</h3>
      <p>
        If your tracking information hasn&rsquo;t updated for several business days or your package is well past its estimated delivery date, contact us and we will open an inquiry with the carrier.
      </p>
      <h3>Lost packages</h3>
      <p>
        If tracking shows your package as delivered but you can&rsquo;t find it, please check around your property and with neighbors or building management, and wait one business day — carriers sometimes mark packages delivered early. If it still hasn&rsquo;t turned up, contact us <Setting value={commerce.deliveryIssueReportWindow} label="reporting window" />. We will work with the carrier to locate the package and, where it is confirmed lost in transit, arrange a replacement or refund.
      </p>
      <h3>Damaged packages or items</h3>
      <p>
        If your order arrives damaged, contact us <Setting value={commerce.deliveryIssueReportWindow} label="reporting window" /> with your order number and photos of the item, the packaging and the shipping label. Please keep the packaging until the issue is resolved, as the carrier may need to inspect it. We will arrange a replacement or refund for items damaged in transit.
      </p>
      <h3>Incorrect or missing items</h3>
      <p>If you receive the wrong item or something is missing from your order, contact us with your order number and a photo of what you received, and we will make it right at no cost to you.</p>

      <h2>Customs, duties and import taxes</h2>
      {commerce.international.enabled ? (
        <p>
          International orders may be subject to import duties, taxes and customs fees charged by the destination country. Unless stated otherwise at checkout, these charges are not included in your order total and are the responsibility of the recipient. Customs processing may also delay delivery.
        </p>
      ) : (
        <p>We do not currently ship outside the United States, so customs duties and import taxes do not apply to orders from this website.</p>
      )}

      <h2>Contact</h2>
      <PolicyContact />
    </PolicyLayout>
  );
}
