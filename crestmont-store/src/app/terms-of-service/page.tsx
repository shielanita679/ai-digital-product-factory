import type { Metadata } from "next";
import Link from "next/link";

import { PolicyContact, PolicyLayout } from "@/components/policy-layout";
import { business } from "@/config/business";
import { policies } from "@/config/policies";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description: `The terms that apply when you use the ${business.brandName} website and buy products from ${business.legalName}.`,
  path: "/terms-of-service",
});

export default function TermsPage() {
  const site = business.domain ?? "this website";
  return (
    <PolicyLayout
      title="Terms of Service"
      path="/terms-of-service"
      intro={
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of {site} (the &ldquo;Site&rdquo;) and any purchase you make from {business.legalName}, a {business.stateOfFormation} limited liability company (&ldquo;{business.brandName}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the Site or placing an order, you agree to these Terms. If you don&rsquo;t agree, please don&rsquo;t use the Site.
        </p>
      }
    >
      <h2>1. Using the Site</h2>
      <p>
        You may use the Site to browse and buy products for your personal, non-commercial use. You agree to use it lawfully and in line with these Terms. We may change, suspend or discontinue any part of the Site at any time.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least {policies.minimumBuyerAge} years old, or the age of majority where you live if that is higher, to place an order. By placing an order you confirm that you meet this requirement and that the information you provide is accurate.
      </p>

      <h2>3. Products</h2>
      <p>
        We try to describe and photograph products accurately, including materials, dimensions and care instructions. Colors may look different on different screens, and some materials vary naturally, so items may differ slightly from their images. Products shown as &ldquo;Coming soon&rdquo; are not yet offered for sale. Products are for household use as described; please follow any included care and use instructions.
      </p>

      <h2>4. Pricing</h2>
      <p>
        Prices are shown in U.S. dollars and do not include shipping or sales tax, which are calculated at checkout and shown before you pay. We may change prices at any time, but changes don&rsquo;t affect orders that have already been accepted.
      </p>

      <h2>5. Orders and order acceptance</h2>
      <p>
        Your order is an offer to buy the products in your cart. After you pay, you&rsquo;ll receive an order confirmation; this confirms we received your order but is not our acceptance of it. We accept your order when we ship the products to you. We may decline or cancel an order — for example, if a product is unavailable, if there was an error in the price or description, if we can&rsquo;t verify payment, or if we suspect fraud or a violation of these Terms. If we cancel an order you&rsquo;ve paid for, we&rsquo;ll refund you in full. We may limit the quantities available per order.
      </p>

      <h2>6. Payment</h2>
      <p>
        Payment is due in full when you place your order and is processed by our third-party payment processor, as described in our <Link href="/payment-policy">Payment Policy</Link>. You confirm that you are authorized to use the payment method you provide.
      </p>

      <h2>7. Order cancellation by you</h2>
      <p>
        You may ask us to cancel an order before it ships by contacting us as soon as possible. See our <Link href="/return-policy">Return &amp; Refund Policy</Link> for details.
      </p>

      <h2>8. Shipping and risk of loss</h2>
      <p>
        Shipping is handled as described in our <Link href="/shipping-policy">Shipping Policy</Link>. Delivery times are estimates, not guarantees. Lost, delayed and damaged deliveries are handled as our Shipping Policy and Return &amp; Refund Policy describe.
      </p>

      <h2>9. Returns and refunds</h2>
      <p>Returns and refunds are governed by our <Link href="/return-policy">Return &amp; Refund Policy</Link>, which forms part of these Terms.</p>

      <h2>10. Intellectual property</h2>
      <p>
        The Site and its content — including text, product descriptions, images, graphics, logos and design — are owned by or licensed to {business.legalName} and are protected by intellectual property laws. You may not copy, reproduce, distribute or create derivative works from them without our written permission, except as needed to view the Site and place orders.
      </p>

      <h2>11. Prohibited activities</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Site for any unlawful or fraudulent purpose, including placing orders with payment methods you are not authorized to use</li>
        <li>Buy products for resale without our written consent</li>
        <li>Interfere with or disrupt the Site, its security, or the servers and networks that host it</li>
        <li>Use bots, scrapers or other automated means to access the Site or place orders</li>
        <li>Attempt to gain unauthorized access to any part of the Site or to other users&rsquo; information</li>
        <li>Upload or transmit viruses or other harmful code</li>
        <li>Submit false, misleading or abusive information through our forms</li>
      </ul>

      <h2>12. Third-party services</h2>
      <p>
        The Site relies on third-party services such as our payment processor, shipping carriers and hosting providers, and may contain links to third-party websites. We are not responsible for third-party websites or services, and your use of them is subject to their own terms and policies.
      </p>

      <h2>13. Errors and inaccuracies</h2>
      <p>
        Occasionally the Site may contain errors relating to product descriptions, pricing, promotions or availability. We reserve the right to correct errors, and to update information or cancel orders affected by an error, at any time, including after an order has been submitted. If an order is canceled because of an error, we&rsquo;ll refund any payment in full.
      </p>

      <h2>14. Disclaimer of warranties</h2>
      <p>
        To the fullest extent permitted by law, the Site and its content are provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; Except as expressly stated in these Terms or required by law, we disclaim all warranties, express or implied, including implied warranties of merchantability, fitness for a particular purpose and non-infringement. We don&rsquo;t warrant that the Site will be uninterrupted or error-free. Nothing in these Terms limits any warranty that cannot be excluded under applicable law.
      </p>

      <h2>15. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {business.legalName} and its members, managers, employees and agents will not be liable for any indirect, incidental, special, consequential or punitive damages arising from your use of the Site or any products purchased through it. Our total liability for any claim relating to a product or order will not exceed the amount you paid for that product or order. Some jurisdictions don&rsquo;t allow certain limitations, so some of these limits may not apply to you.
      </p>

      <h2>16. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless {business.legalName} and its members, managers, employees and agents from any claims, losses and expenses (including reasonable attorneys&rsquo; fees) arising from your breach of these Terms or your misuse of the Site.
      </p>

      <h2>17. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of {policies.governingLaw.state}, {policies.governingLaw.country}, and applicable U.S. federal law, without regard to conflict-of-law rules. Nothing in this section removes protections you have under the consumer laws of the place where you live.
      </p>

      <h2>18. Severability</h2>
      <p>If any provision of these Terms is found unenforceable, the remaining provisions will remain in full effect, and the unenforceable provision will be applied to the fullest extent permitted.</p>

      <h2>19. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Changes take effect when posted, with the &ldquo;Last updated&rdquo; date above revised. The Terms in effect when you place an order apply to that order.
      </p>

      <h2>20. Contact</h2>
      <PolicyContact />
    </PolicyLayout>
  );
}
