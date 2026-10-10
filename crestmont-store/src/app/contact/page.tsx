import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/components/forms/contact-form";
import { PageHeader } from "@/components/page-header";
import { addressLines, business, publicSupportSchedule } from "@/config/business";
import { isContactDeliveryConfigured } from "@/lib/deliver";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Contact Us",
  description: `Contact ${business.brandName} customer support about an order, product, delivery or return.`,
  path: "/contact",
});

export default function ContactPage() {
  const support = publicSupportSchedule();
  return (
    <>
      <PageHeader
        title="Contact us"
        crumbs={[{ label: "Contact", href: "/contact" }]}
        intro={<p>Questions about an order, a product, shipping or a return? Send us a message and include your order number if you have one — it helps us find your order quickly.</p>}
      />
      <div className="page-x grid gap-14 py-12 sm:py-16 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ContactForm available={isContactDeliveryConfigured()} />
        </div>
        <aside className="space-y-8 text-sm lg:col-span-4 lg:col-start-9">
          {business.supportEmail && (
            <div>
              <h2 className="eyebrow">Email</h2>
              <p className="mt-2 text-base">
                <a href={`mailto:${business.supportEmail}`} className="link">{business.supportEmail}</a>
              </p>
            </div>
          )}
          {business.phone && (
            <div>
              <h2 className="eyebrow">Phone</h2>
              <p className="mt-2 text-base"><a href={`tel:${business.phone}`} className="link">{business.phone}</a></p>
            </div>
          )}
          {support && (
            <div>
              <h2 className="eyebrow">Support hours</h2>
              <p className="mt-2 leading-6 text-ink-2">
                Customer support is available {support.hours}. We aim to send a first response {support.responseTime}; some issues may take longer to fully resolve.
              </p>
            </div>
          )}
          <div>
            <h2 className="eyebrow">Mailing address</h2>
            <address className="mt-2 leading-6 text-ink-2 not-italic">
              <span className="block font-medium text-ink">{business.legalName}</span>
              {addressLines().map((l) => (
                <span key={l} className="block">{l}</span>
              ))}
            </address>
            <p className="mt-2 text-[0.8125rem] leading-5 text-muted">
              This is our business mailing address, not a store or returns location. Please don&rsquo;t send returns here — <Link href="/return-policy" className="link">contact customer support</Link> for return instructions first.
            </p>
          </div>
          <div>
            <h2 className="eyebrow">Helpful links</h2>
            <ul className="mt-2 space-y-1.5">
              <li><Link href="/order-tracking" className="link">Order tracking</Link></li>
              <li><Link href="/faq" className="link">Frequently asked questions</Link></li>
              <li><Link href="/shipping-policy" className="link">Shipping policy</Link></li>
              <li><Link href="/return-policy" className="link">Return &amp; refund policy</Link></li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
