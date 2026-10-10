import type { Metadata } from "next";
import Link from "next/link";

import { PolicyContact, PolicyLayout } from "@/components/policy-layout";
import { business } from "@/config/business";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Cookie Policy",
  description: `How the ${business.brandName} website uses cookies and browser storage.`,
  path: "/cookie-policy",
});

export default function CookiePolicyPage() {
  return (
    <PolicyLayout
      title="Cookie Policy"
      path="/cookie-policy"
      intro={<p>This policy explains how this website, operated by {business.legalName}, uses cookies and similar browser storage technologies.</p>}
    >
      <h2>What cookies and browser storage are</h2>
      <p>
        Cookies are small text files a website stores in your browser. Local storage is a similar browser feature that lets a website save information on your device. Both can be used to remember things between visits.
      </p>

      <h2>What this website uses</h2>
      <p>This website does not set advertising or cross-site tracking cookies. We use:</p>
      <ul>
        <li>
          <strong>Cart storage (strictly necessary).</strong> The items in your cart — product codes and quantities only — are saved in your browser&rsquo;s local storage under the key <code>crestmont.cart.v1</code>, so your cart is still there when you come back. This information stays on your device and is sent to us only when you start checkout.
        </li>
      </ul>

      <h2>Third-party checkout</h2>
      <p>
        When you continue to payment, you are taken to our payment processor&rsquo;s hosted checkout page. That page is operated by the payment processor, which may use its own cookies and similar technologies for security, fraud prevention and to remember your preferences, under its own privacy and cookie policies.
      </p>

      <h2>Analytics</h2>
      <p>
        We do not currently use analytics cookies. If we add analytics or any other non-essential cookies in the future, we will update this policy before doing so and, where required by law, ask for your consent.
      </p>

      <h2>Managing cookies and storage</h2>
      <p>
        You can clear or block cookies and local storage in your browser settings. If you clear site data, your cart will be emptied. Blocking strictly necessary storage may mean the cart doesn&rsquo;t persist between visits, but you can still shop and check out in a single session.
      </p>

      <h2>More information</h2>
      <p>For more about how we handle personal information, see our <Link href="/privacy-policy">Privacy Policy</Link>.</p>

      <h2>Contact</h2>
      <PolicyContact />
    </PolicyLayout>
  );
}
