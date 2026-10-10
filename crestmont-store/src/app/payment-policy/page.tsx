import type { Metadata } from "next";
import Link from "next/link";

import { PolicyContact, PolicyLayout } from "@/components/policy-layout";
import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Payment Policy",
  description: `How payments work for ${business.brandName} orders: accepted payment methods, secure processing, security checks and refunds.`,
  path: "/payment-policy",
});

export default function PaymentPolicyPage() {
  return (
    <PolicyLayout
      title="Payment Policy"
      path="/payment-policy"
      intro={<p>This policy explains how payment works when you buy from {business.legalName} through this website.</p>}
    >
      <h2>Accepted payment methods</h2>
      <p>
        The payment methods available for your order are displayed on the secure checkout page. Which methods are offered can depend on your location, your order and your device. We only accept the methods shown at checkout.
      </p>

      <h2>Currency and pricing</h2>
      <p>
        All prices on this website are listed in U.S. dollars ({commerce.currency}). The price shown on each product page is the price charged for that item. Shipping costs and any applicable sales tax are calculated and displayed at checkout, along with your final total, before you confirm payment. If your card is issued outside the United States, your bank may apply currency conversion or foreign transaction fees; those fees are set by your bank, not by us.
      </p>

      <h2>When payment is taken</h2>
      <p>
        Payment is required in full before an order is processed. Your payment method is charged when you confirm your order on the checkout page. We do not begin preparing an order until payment has been successfully authorized.
      </p>

      <h2>How payments are processed</h2>
      <p>
        Payments are processed securely by our third-party payment processor on its hosted checkout page, over an encrypted (HTTPS) connection. Your full card number and security code are entered directly with the payment processor and are <strong>not</strong> transmitted to or stored on our servers. We receive limited information about the transaction — such as the payment status, the amount, the type of payment method and, for cards, the last four digits — to fulfil and support your order. See our <Link href="/privacy-policy">Privacy Policy</Link> for details.
      </p>

      <h2>Billing information</h2>
      <p>
        You agree to provide current, complete and accurate billing and contact information, and to use only payment methods you are authorized to use. Orders with inaccurate or incomplete information may be delayed or canceled.
      </p>

      <h2>Fraud prevention and security checks</h2>
      <p>
        To protect our customers and our business, orders may be subject to automated and manual fraud and security checks by us and our payment processor. We may contact you to verify information, and we may decline or cancel an order that cannot be verified or that we reasonably believe is fraudulent or unauthorized. If an order is canceled after payment, the full amount is refunded to the original payment method.
      </p>

      <h2>Failed or declined payments</h2>
      <p>
        If your payment is declined, your order will not be placed. Please check the details you entered or contact your bank or card issuer, as we are not given the specific reason for a decline.
      </p>

      <h2>Refunds</h2>
      <p>
        When a refund is approved under our <Link href="/return-policy">Return &amp; Refund Policy</Link>, it is generally returned to the original payment method used for the purchase. The time it takes to appear on your statement depends on your bank or payment provider.
      </p>

      <h2>Disputes and chargebacks</h2>
      <p>
        If you have a problem with a charge, please contact us first — most issues can be resolved quickly. This does not limit your right to dispute a charge with your card issuer or payment provider.
      </p>

      <h2>Contact</h2>
      <PolicyContact />
    </PolicyLayout>
  );
}
