import type { Metadata } from "next";
import Link from "next/link";

import { PolicyContact, PolicyLayout } from "@/components/policy-layout";
import { Setting } from "@/components/setting";
import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Return & Refund Policy",
  description: `Return eligibility, how to request a return, refunds and order cancellations for ${business.brandName} orders.`,
  path: "/return-policy",
});

export default function ReturnPolicyPage() {
  const r = commerce.returns;
  return (
    <PolicyLayout
      title="Return & Refund Policy"
      path="/return-policy"
      intro={<p>We want you to be able to order with confidence. This policy explains which items can be returned, how to start a return, and how refunds work for orders placed with {business.legalName}.</p>}
    >
      <h2>Return window</h2>
      <p>
        You may request a return within <strong><Setting value={r.windowDays} label="return window" />{r.windowDays !== null && " days"}</strong> of the delivery date shown in your tracking information. Requests made after this period can&rsquo;t be accepted, except for damaged, defective or incorrect items as described below.
      </p>

      <h2>Eligibility and condition</h2>
      <p>To be eligible for a change-of-mind return, items must be:</p>
      <ul>
        <li>Unused, unwashed and in the same condition you received them</li>
        <li>In their original packaging, with any tags, inserts and included accessories</li>
        <li>From an order placed on this website</li>
      </ul>
      <p>We inspect every return when it arrives. Items that don&rsquo;t meet these conditions may be refused and sent back to you, or may receive a partial refund if we explain why.</p>

      <h2>Non-returnable items</h2>
      <p>The following can&rsquo;t be returned for a change of mind:</p>
      <ul>
        {r.nonReturnable.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p>Final-sale status is always shown on the product page before purchase.</p>

      <h2>How to request a return</h2>
      <ol>
        <li><Link href="/contact">Contact customer support</Link> with your order number, the items you&rsquo;d like to return and the reason.</li>
        <li>We&rsquo;ll confirm whether the items are eligible and email you return instructions, including where to send them.</li>
        <li>Pack the items securely in their original packaging and ship them as instructed. We recommend using a trackable shipping method.</li>
      </ol>
      <p>
        <strong>Please don&rsquo;t send items back without contacting us first.</strong> Our business mailing address is not a returns location, and returns sent there or without instructions may not be processed. Contact customer support for return instructions.
      </p>

      <h2>Return shipping costs</h2>
      <p>
        {r.returnShippingPaidBy === null && <>For change-of-mind returns, return shipping is paid by: <Setting value={null} label="customer or store" />. </>}
        {r.returnShippingPaidBy === "customer" && <>For change-of-mind returns, you are responsible for return shipping costs. Original shipping charges are not refundable. </>}
        {r.returnShippingPaidBy === "store" && <>For eligible change-of-mind returns, we provide return shipping at no cost to you. Instructions will be included with your return approval. </>}
        For damaged, defective or incorrect items, we cover return shipping.
      </p>
      <p>
        Restocking fee:{" "}
        {r.restockingFeePercent === null ? <Setting value={null} label="restocking fee" /> : r.restockingFeePercent === 0 ? "we do not charge a restocking fee." : `a restocking fee of ${r.restockingFeePercent}% applies to change-of-mind returns.`}
      </p>

      <h2>Damaged, defective or incorrect items</h2>
      <p>
        If an item arrives damaged or defective, or we sent the wrong item, contact us <Setting value={commerce.deliveryIssueReportWindow} label="reporting window" /> with your order number and photos. We&rsquo;ll offer a replacement or a full refund, including original shipping charges for the affected items. In some cases we may ask you to return the item; in others we may not need it back.
      </p>

      <h2>Refunds</h2>
      <p>
        Once your return is received and inspected, we&rsquo;ll email you to confirm whether the refund is approved. Approved refunds are issued <Setting value={r.refundProcessingDays} label="refund processing time" /> after inspection, to the <strong>original payment method</strong> used for the order. We can&rsquo;t issue refunds to a different card or account.
      </p>
      <p>After we issue a refund, your bank or card issuer may take additional time to post it to your account, depending on their processing times.</p>

      <h2>Exchanges</h2>
      <p>We don&rsquo;t process direct exchanges. If you&rsquo;d like a different size or color, return the original item for a refund and place a new order.</p>

      <h2>Order cancellation</h2>
      <p>
        You can request to cancel an order by contacting us as soon as possible. Orders can usually be canceled <Setting value={commerce.orderChangeWindow} label="order change window" />. If the order hasn&rsquo;t shipped, we&rsquo;ll cancel it and refund the full amount to your original payment method. Once an order has shipped, it can&rsquo;t be canceled, but eligible items may be returned under this policy.
      </p>
      <p>
        We may cancel an order, for example if an item is unavailable, a pricing error has occurred, or the order can&rsquo;t pass our payment security checks. If we cancel an order after payment, we&rsquo;ll notify you and issue a full refund to the original payment method.
      </p>

      <h2>Your legal rights</h2>
      <p>This policy doesn&rsquo;t limit any rights you may have under applicable consumer protection laws.</p>

      <h2>Contact</h2>
      <PolicyContact />
    </PolicyLayout>
  );
}
