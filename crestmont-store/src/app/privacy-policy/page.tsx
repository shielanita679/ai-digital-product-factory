import type { Metadata } from "next";
import Link from "next/link";

import { PolicyContact, PolicyLayout } from "@/components/policy-layout";
import { business, privacyContactEmail } from "@/config/business";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description: `How ${business.legalName} collects, uses, shares and protects personal information, and the choices available to you.`,
  path: "/privacy-policy",
});

export default function PrivacyPolicyPage() {
  return (
    <PolicyLayout
      title="Privacy Policy"
      path="/privacy-policy"
      intro={
        <p>
          This Privacy Policy describes how {business.legalName} (&ldquo;{business.brandName}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses and shares personal information when you visit this website, contact us or make a purchase.
        </p>
      }
    >
      <h2>Information we collect</h2>
      <h3>Information you provide</h3>
      <ul>
        <li><strong>Order information:</strong> your name, email address, shipping and billing address, phone number (if provided) and the items you purchase.</li>
        <li><strong>Messages:</strong> the details you submit through our contact or order-status forms, such as your name, email, order number and message.</li>
      </ul>
      <h3>Payment information</h3>
      <p>
        Payments are processed by our third-party payment processor. Your full card number, security code and similar credentials are entered on the processor&rsquo;s secure checkout page and are collected and processed by the processor under its own privacy policy. <strong>We do not receive or store your full card number or security code.</strong> We receive limited payment details, such as the payment status, amount, payment method type and, for cards, the brand and last four digits.
      </p>
      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Device and log data:</strong> when you visit, our hosting provider automatically records technical information such as your IP address, browser type, pages requested and the date and time of the request. This is used to operate, secure and troubleshoot the website.</li>
        <li><strong>Browser storage:</strong> the contents of your cart are saved in your browser&rsquo;s local storage on your own device so they are still there when you return. See our <Link href="/cookie-policy">Cookie Policy</Link>.</li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To process, fulfil, ship and support your orders, including sending order confirmations and shipping updates</li>
        <li>To respond to your messages and provide customer support</li>
        <li>To process returns, refunds and cancellations</li>
        <li>To detect, investigate and prevent fraud, unauthorized transactions and abuse of the website</li>
        <li>To operate, maintain, secure and improve the website</li>
        <li>To comply with legal, tax and accounting obligations and to enforce our <Link href="/terms-of-service">Terms of Service</Link></li>
      </ul>

      <h2>Orders and fraud prevention</h2>
      <p>
        When you place an order, we and our payment processor may use order, device and payment information to check for fraud and to verify transactions. This can include automated risk checks. Orders that cannot be verified may be canceled and refunded, as described in our <Link href="/payment-policy">Payment Policy</Link>.
      </p>

      <h2>Cookies and analytics</h2>
      <p>
        This website does not use advertising cookies. The site itself uses browser storage only to remember your cart. Our payment processor may set cookies on its own checkout page for security and fraud prevention. If we add analytics or other non-essential tools in the future, we will update this policy and our <Link href="/cookie-policy">Cookie Policy</Link> and, where required, ask for your consent first.
      </p>

      <h2>How we share information</h2>
      <p>We do not sell your personal information, and we do not share it for cross-context behavioral advertising. We share information only as needed with:</p>
      <ul>
        <li><strong>Service providers</strong> who help us run the business, such as our payment processor, website hosting provider, email delivery provider, customer-support tools and shipping carriers. They may use the information only to provide services to us.</li>
        <li><strong>Shipping carriers</strong>, who receive your name, shipping address and, where needed, phone number to deliver your order.</li>
        <li><strong>Professional advisers and authorities</strong>, such as accountants, lawyers or government authorities, when required by law or to protect our rights, customers or others.</li>
        <li><strong>A successor business</strong>, if we are involved in a merger, acquisition or sale of assets, subject to this policy.</li>
      </ul>

      <h2>Marketing communications</h2>
      <p>
        We do not currently send marketing emails. If we introduce them in the future, we will send them only to people who have signed up, every message will include a way to unsubscribe, and we will update this policy first. Order confirmations and other transactional messages about your purchases are not marketing.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep order and transaction records for as long as needed to fulfil orders, handle returns and meet tax, accounting and legal requirements. Support messages are kept for as long as needed to resolve your request and maintain a record of it. When information is no longer needed, we delete or anonymize it.
      </p>

      <h2>Your rights and choices</h2>
      <p>Depending on where you live, you may have the right to:</p>
      <ul>
        <li>Request access to the personal information we hold about you</li>
        <li>Request that we correct inaccurate information</li>
        <li>Request that we delete your information, subject to legal exceptions (for example, records we must keep for tax purposes)</li>
        <li>Request a copy of your information in a portable format</li>
        <li>Opt out of any marketing emails we may send in the future</li>
        <li>Not be discriminated against for exercising these rights</li>
      </ul>
      <p>
        To make a request, contact us using the details below. We will need to verify your identity, usually by confirming details of your order or your email address. You may use an authorized agent where permitted by law. If we deny your request, you may be able to appeal by replying to our decision.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable administrative, technical and physical safeguards to protect personal information, including encrypted (HTTPS) connections and limiting access to the people and providers who need it. Payment card details are handled by our payment processor and are not stored on our systems. No method of transmission or storage is completely secure, so we can&rsquo;t guarantee absolute security.
      </p>

      <h2>Children&rsquo;s privacy</h2>
      <p>This website is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided us with personal information, contact us and we will delete it.</p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy from time to time. When we do, we will change the &ldquo;Last updated&rdquo; date above, and for significant changes we may provide additional notice.</p>

      <h2>Contact</h2>
      <PolicyContact email={privacyContactEmail()} />
    </PolicyLayout>
  );
}
