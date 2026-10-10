import type { Metadata } from "next";
import Link from "next/link";

import { PolicyContact, PolicyLayout } from "@/components/policy-layout";
import { Setting } from "@/components/setting";
import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { requiredInfoPhrase, resolutionsPhrase } from "@/lib/policy-text";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Return & Refund Policy",
  description: `Return eligibility, how to request a return, damaged or incorrect items, refunds and cancellations for ${business.brandName} orders.`,
  path: "/return-policy",
});

export default function ReturnPolicyPage() {
  const r = commerce.returns;
  const d = commerce.damagedOrIncorrect;
  return (
    <PolicyLayout
      title="Return & Refund Policy"
      path="/return-policy"
      intro={<p>This policy explains which items can be returned, how to start a return, how damaged or incorrect items are handled, and how refunds work for orders placed with {business.legalName}.</p>}
    >
      <h2>Return window</h2>
      <p>
        Eligible items may be returned within <strong><Setting value={r.windowDays} label="return window" />{r.windowDays !== null && " days"} after delivery</strong>, based on the delivery date shown in the tracking information. Not every product is eligible: whether an item can be returned is shown on its product page before you buy.
      </p>

      <h2>Return eligibility</h2>
      <p>To be eligible for a standard return:</p>
      <ul>
        {r.conditions.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <p>If a returned item doesn&rsquo;t meet these conditions, we will contact you before deciding how to proceed.</p>

      <h2>Non-returnable items</h2>
      <p>The following cannot be returned through the standard return process:</p>
      <ul>
        {r.nonReturnable.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p>This does not affect how we handle items that arrive damaged or incorrect, described below.</p>

      <h2>How to request a return</h2>
      <ol>
        <li><Link href="/contact">Contact customer support</Link> with your order number, the items you&rsquo;d like to return and the reason.</li>
        <li>We&rsquo;ll confirm whether the items are eligible and email you return instructions.</li>
        <li>Pack the items securely, in their original packaging where applicable, and ship them as instructed. We recommend a trackable shipping method.</li>
      </ol>
      <p>
        <strong>Please don&rsquo;t send items back without contacting us first.</strong> Our business mailing address is not a returns location. Contact customer support for return instructions.
      </p>

      <h2>Return shipping and fees</h2>
      <p>
        {r.returnShippingPaidBy === "store"
          ? "For eligible change-of-mind returns, we provide return shipping at no cost to you."
          : r.returnShippingPaidBy === "customer"
            ? "For change-of-mind returns, you are responsible for the cost of return shipping unless we state otherwise."
            : <>Return shipping for change-of-mind returns: <Setting value={null} label="return shipping responsibility" />.</>}
      </p>
      <p>
        {r.restockingFeePercent === 0
          ? "We do not charge a restocking fee."
          : r.restockingFeePercent === null
            ? <>Restocking fee: <Setting value={null} label="restocking fee" />.</>
            : `A restocking fee of ${r.restockingFeePercent}% applies to change-of-mind returns.`}
      </p>

      <h2 id="damaged-or-incorrect">Damaged or incorrect items</h2>
      <p>
        If an item arrives damaged, or you receive an incorrect item, contact us <strong>{d.reportWindow}</strong> and include {requiredInfoPhrase()}.
      </p>
      <p>
        Our support team will review the issue and determine the appropriate resolution. Depending on the circumstances and product availability, we may offer {resolutionsPhrase()}. A replacement is possible only if the item is available. You won&rsquo;t necessarily need to return a damaged or incorrect item — we&rsquo;ll tell you if we need it back. When a return is required for an incorrect item, or for damage we verify occurred before delivery, {business.legalName} covers the reasonable cost of return shipping.
      </p>

      <h2>Refunds</h2>
      <p>
        After we receive and inspect your return, we&rsquo;ll email you to confirm whether the refund is approved. For approved refunds, our processing period is <strong><Setting value={r.refundProcessingDays} label="refund processing time" /></strong>. This is the time it takes us to issue the refund.
      </p>
      <p>
        Refunds are normally issued to the original payment method used for the order. After we issue a refund, your bank or payment provider may need additional time to post the credit to your account, so we can&rsquo;t give an exact date for when it will appear.
      </p>

      <h2>Exchanges</h2>
      {r.exchangesOffered ? (
        <p>Contact customer support to arrange an exchange for an eligible item.</p>
      ) : (
        <p>
          We don&rsquo;t offer direct exchanges at this time. If you&rsquo;d like a different product or variant, you can return an eligible item under this policy and place a new order. This doesn&rsquo;t apply to damaged or incorrect items, which support resolves as described above.
        </p>
      )}

      <h2>Order cancellation</h2>
      <p>
        You may request a cancellation {commerce.orderChangeCutoff}. Contact us as soon as possible with your order number. Once an order has been processed for shipment, it may no longer be possible to cancel it, so we can&rsquo;t guarantee every cancellation request can be completed. If we do cancel an order you have paid for, we refund the full amount to the original payment method.
      </p>
      <p>
        We may cancel an order ourselves — for example, if an item is unavailable, a pricing error has occurred or the order can&rsquo;t pass our payment security checks. If we cancel an order after payment, we&rsquo;ll notify you and issue a full refund to the original payment method.
      </p>

      <h2>Your legal rights</h2>
      <p>This policy doesn&rsquo;t limit any rights you may have under applicable consumer protection laws.</p>

      <h2>Contact</h2>
      <PolicyContact />
    </PolicyLayout>
  );
}
