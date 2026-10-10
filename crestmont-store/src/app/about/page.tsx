import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { addressLines, business } from "@/config/business";
import { getCollections } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About Us",
  description: `${business.brandName} is an online store for home and everyday living products, operated by ${business.legalName}, a ${business.address.regionName} limited liability company based in ${business.address.city}.`,
  path: "/about",
});

export default function AboutPage() {
  const collections = getCollections();
  return (
    <>
      <PageHeader title="About us" crumbs={[{ label: "About", href: "/about" }]} />
      <div className="page-x grid gap-12 py-12 sm:py-16 lg:grid-cols-12">
        <div className="prose-store lg:col-span-7">
          <p className="!mt-0 font-serif text-2xl leading-snug text-ink">
            {business.legalName} operates {business.brandName}, an e-commerce storefront focused on practical products for the home and everyday routines.
          </p>

          <h2>What we sell</h2>
          <p>Our range is organized into {collections.length} collections:</p>
          <ul>
            {collections.map((c) => (
              <li key={c.slug}>
                <Link href={`/collections/${c.slug}`}>{c.name}</Link> — {c.description.charAt(0).toLowerCase() + c.description.slice(1)}
              </li>
            ))}
          </ul>
          <p>We keep the range focused, and we add products to the store as their details are confirmed.</p>

          <h2>Straightforward product information</h2>
          <p>
            We aim to describe every product plainly: what it is, its materials and dimensions, how to care for it and what comes in the package. A product isn&rsquo;t offered for sale until those details and its photography are published on its page.
          </p>

          <h2>Clear purchasing terms</h2>
          <p>
            Prices are shown in U.S. dollars. Shipping costs and any applicable tax appear at checkout before you pay, and payment is handled on our payment processor&rsquo;s secure, hosted checkout page. How we ship, accept returns and issue refunds is set out in our <Link href="/shipping-policy">Shipping Policy</Link>, <Link href="/return-policy">Return &amp; Refund Policy</Link> and <Link href="/payment-policy">Payment Policy</Link>.
          </p>

          <h2>Accessible customer support</h2>
          <p>
            If you have a question about a product, an order or a delivery, <Link href="/contact">contact us</Link>. Include your order number if you have one so we can find it quickly.
          </p>
        </div>

        <aside className="lg:col-span-4 lg:col-start-9">
          <div className="border border-line bg-surface p-6 text-sm leading-6 lg:sticky lg:top-28">
            <h2 className="eyebrow">Company details</h2>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-muted">Legal name</dt>
                <dd className="font-medium text-ink">{business.legalName}</dd>
              </div>
              <div>
                <dt className="text-muted">Entity</dt>
                <dd className="text-ink-2">
                  {business.entityType}, formed in {business.stateOfFormation}, {business.countryOfFormation}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Business address</dt>
                <dd className="text-ink-2">
                  <address className="not-italic">
                    {addressLines().map((l) => (
                      <span key={l} className="block">{l}</span>
                    ))}
                  </address>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Contact</dt>
                <dd className="text-ink-2">
                  {business.supportEmail ? (
                    <a href={`mailto:${business.supportEmail}`} className="link">{business.supportEmail}</a>
                  ) : (
                    <Link href="/contact" className="link">Contact form</Link>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </>
  );
}
