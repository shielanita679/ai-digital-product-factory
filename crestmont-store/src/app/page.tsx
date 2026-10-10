import type { Metadata } from "next";
import Link from "next/link";

import { CollectionTile } from "@/components/collection-tile";
import { ArrowRightIcon, LockIcon, MailIcon, ReturnIcon, TruckIcon } from "@/components/icons";
import { ProductGrid } from "@/components/product/product-card";
import { Setting } from "@/components/setting";
import { business, publicSupportSchedule } from "@/config/business";
import { commerce } from "@/config/commerce";
import { getCollections, getProductsInCollection, getPurchasableProducts, getVisibleProducts } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

const homeTitle = `${business.brandName} | Home & Everyday Living`;

export const metadata: Metadata = {
  ...pageMetadata({
    title: homeTitle,
    description: `${business.brandName} is an online store for practical home and everyday living products: kitchen and dining, home organization, home comfort, and travel and everyday essentials.`,
    path: "/",
  }),
  title: { absolute: homeTitle },
};

function SectionHeading({ eyebrow, title, intro, href, linkLabel }: { eyebrow?: string; title: string; intro?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 sm:mb-10">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-2 text-3xl sm:text-4xl">{title}</h2>
        {intro && <p className="mt-3 max-w-xl text-ink-2">{intro}</p>}
      </div>
      {href && (
        <Link href={href} className="hidden shrink-0 items-center gap-1.5 text-sm hover:underline hover:underline-offset-4 sm:inline-flex">
          {linkLabel} <ArrowRightIcon size={16} />
        </Link>
      )}
    </div>
  );
}

export default function HomePage() {
  const collections = getCollections();
  const products = getVisibleProducts();
  // "New arrivals" language is only used once something can actually be bought.
  const hasAvailableProducts = getPurchasableProducts().length > 0;
  const returnWindow = commerce.returns.windowDays;
  const support = publicSupportSchedule();

  return (
    <>
      {/* A. Hero */}
      <section className="border-b border-line">
        <div className="page-x grid gap-12 py-14 sm:py-20 lg:grid-cols-12 lg:items-end lg:gap-16 lg:py-24">
          <div className="lg:col-span-7">
            <p className="eyebrow">Home &amp; Everyday Living</p>
            <h1 className="mt-4 text-[2.5rem] leading-[1.06] sm:text-6xl lg:text-[4.25rem]">Practical goods for everyday living.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-ink-2">
              Home, organization and everyday essentials, selected for useful, straightforward function.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/shop" className="btn-primary">Explore the collection</Link>
              {hasAvailableProducts ? (
                <Link href="/shop" className="btn-secondary">Shop new arrivals</Link>
              ) : (
                <Link href="/collections" className="btn-secondary">Explore collections</Link>
              )}
            </div>
          </div>
          <nav aria-label="Collections" className="lg:col-span-5">
            <ul className="border-t border-ink">
              {collections.map((c, i) => (
                <li key={c.slug} className="border-b border-line">
                  <Link href={`/collections/${c.slug}`} className="group flex items-baseline gap-4 py-4 sm:py-5">
                    <span className="w-6 shrink-0 font-serif text-sm text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1 font-serif text-xl sm:text-2xl">{c.name}</span>
                    <ArrowRightIcon size={18} className="shrink-0 self-center text-muted transition-transform group-hover:translate-x-1 group-hover:text-ink" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* B. Collections */}
      <section className="page-x py-16 sm:py-20">
        <SectionHeading eyebrow="Collections" title="Shop by collection" href="/collections" linkLabel="All collections" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {collections.map((c, i) => (
            <CollectionTile key={c.slug} collection={c} index={i} count={getProductsInCollection(c.slug).length} />
          ))}
        </div>
      </section>

      {/* C. Products */}
      <section className="page-x pb-16 sm:pb-20">
        <SectionHeading
          eyebrow={hasAvailableProducts ? "The range" : "Coming soon"}
          title={hasAvailableProducts ? "Shop the range" : "The initial range"}
          intro={hasAvailableProducts ? undefined : "Our first products are being prepared for launch. Specifications and photography are published on each product page before it goes on sale."}
          href="/shop"
          linkLabel="View all products"
        />
        <ProductGrid products={products} />
      </section>

      {/* D. What to expect */}
      <section className="border-y border-line bg-surface">
        <div className="page-x grid gap-12 py-16 sm:py-20 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="eyebrow">Shopping with us</p>
            <h2 className="mt-2 text-3xl sm:text-4xl">What you can expect when you order</h2>
            <p className="mt-4 text-ink-2">
              {business.brandName} is an online store operated by {business.legalName}, based in {business.address.city}, {business.address.regionName}. Here is how we handle the parts of an order that matter most.
            </p>
            <Link href="/about" className="link mt-6 inline-block text-sm">More about us</Link>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
            <div>
              <dt className="font-medium">Clear product information</dt>
              <dd className="mt-1.5 text-sm leading-6 text-ink-2">Product pages list materials, dimensions, care instructions and what&rsquo;s included. Products aren&rsquo;t offered for sale until those details are published.</dd>
            </div>
            <div>
              <dt className="font-medium">Secure checkout</dt>
              <dd className="mt-1.5 text-sm leading-6 text-ink-2">Payment is entered on our payment processor&rsquo;s hosted, encrypted checkout page. We never see or store your full card number.</dd>
            </div>
            <div>
              <dt className="font-medium">Transparent shipping</dt>
              <dd className="mt-1.5 text-sm leading-6 text-ink-2">Shipping costs, any applicable tax and the final total are shown at checkout before you pay. Nothing is added afterward.</dd>
            </div>
            <div>
              <dt className="font-medium">Straightforward returns</dt>
              <dd className="mt-1.5 text-sm leading-6 text-ink-2">
                Eligible items can be returned within <Setting value={returnWindow} label="return window" />{returnWindow !== null && " days"} of delivery, and final-sale items are marked on the product page. The full terms are in our <Link href="/return-policy" className="link">Return &amp; Refund Policy</Link>.
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium">Order support</dt>
              <dd className="mt-1.5 text-sm leading-6 text-ink-2">
                Questions about an order, a product or a delivery go straight to our support inbox. <Link href="/contact" className="link">Contact us</Link> with your order number and we&rsquo;ll take it from there.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* F. Shopping information */}
      <section className="border-t border-line">
        <div className="page-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem icon={<LockIcon />} title="Secure checkout" href="/payment-policy" linkLabel="Payment policy">
            Accepted payment methods are shown at checkout. Payments are processed by our payment provider over an encrypted connection.
          </InfoItem>
          <InfoItem icon={<TruckIcon />} title="Shipping" href="/shipping-policy" linkLabel="Shipping policy">
            Orders are processed within <Setting value={commerce.processingTime} label="processing time" />. Estimated US delivery is <Setting value={commerce.domesticDeliveryEstimate} label="delivery estimate" /> after dispatch.
          </InfoItem>
          <InfoItem icon={<MailIcon />} title="Customer support" href="/contact" linkLabel="Contact us">
            Contact us about orders, products or deliveries
            {support ? <>. Support is available {support.hours}, and we aim to respond {support.responseTime}.</> : "."}
          </InfoItem>
          <InfoItem icon={<ReturnIcon />} title="Returns" href="/return-policy" linkLabel="Return policy">
            Contact customer support to start a return. We&rsquo;ll confirm eligibility and send instructions.
          </InfoItem>
        </div>
      </section>

    </>
  );
}

function InfoItem({ icon, title, href, linkLabel, children }: { icon: React.ReactNode; title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-ink">{icon}</span>
      <h3 className="mt-3 font-sans text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-ink-2">{children}</p>
      <Link href={href} className="link mt-2 inline-block text-[0.8125rem]">{linkLabel}</Link>
    </div>
  );
}
