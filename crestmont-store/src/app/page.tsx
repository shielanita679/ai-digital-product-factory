import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { NewsletterForm } from "@/components/forms/newsletter-form";
import { ArrowRightIcon, LockIcon, MailIcon, ReturnIcon, TruckIcon } from "@/components/icons";
import { ProductGrid } from "@/components/product/product-card";
import { Setting } from "@/components/setting";
import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { getCollections, getEssentialProducts, getFeaturedProducts, getProductsInCollection } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: `${business.brandName} | Home, Kitchen, Desk & Travel Goods`,
    description: `Shop stoneware, linen, wood and canvas goods for the kitchen, home, desk and travel from ${business.brandName}. Clear product details, secure checkout and straightforward policies.`,
    path: "/",
  }),
  title: { absolute: `${business.brandName} | Home, Kitchen, Desk & Travel Goods` },
};

function SectionHeading({ eyebrow, title, href, linkLabel }: { eyebrow?: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 sm:mb-10">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-2 text-3xl sm:text-4xl">{title}</h2>
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
  const featured = getFeaturedProducts(8);
  const essentials = getEssentialProducts(4);
  const returnWindow = commerce.returns.windowDays;

  return (
    <>
      {/* A. Hero */}
      <section className="border-b border-line">
        <div className="page-x grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-20">
          <div className="lg:col-span-5">
            <p className="eyebrow">Kitchen · Home · Desk · Travel</p>
            <h1 className="mt-4 text-[2.5rem] leading-[1.08] sm:text-5xl lg:text-[3.5rem]">Everyday goods, described plainly.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-ink-2">
              Stoneware, glass, wood, linen and canvas pieces for daily use. Every listing shows materials, dimensions, care and what&rsquo;s in the box, so you know exactly what you&rsquo;re ordering.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/shop" className="btn-primary">Shop now</Link>
              <Link href="/collections" className="btn-secondary">Explore collections</Link>
            </div>
          </div>
          <div className="lg:col-span-7">
            <div className="overflow-hidden bg-surface">
              <Image
                src="/images/lifestyle/hero.svg"
                alt="Cutting board, glass pour-over set, stoneware mugs and a ceramic planter on a kitchen counter"
                width={1600}
                height={1200}
                preload
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="aspect-[4/3] h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* B. Collections */}
      <section className="page-x py-16 sm:py-20">
        <SectionHeading eyebrow="Collections" title="Shop by room and routine" href="/collections" linkLabel="All collections" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {collections.map((c) => (
            <Link key={c.slug} href={`/collections/${c.slug}`} className="group block">
              <div className="overflow-hidden bg-surface">
                <Image
                  src={c.image.src}
                  alt={c.image.alt}
                  width={c.image.width}
                  height={c.image.height}
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  loading="lazy"
                  className="aspect-[4/3] h-auto w-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.02]"
                />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-xl">{c.name}</h3>
                <span className="text-[0.8125rem] text-muted">{getProductsInCollection(c.slug).length} products</span>
              </div>
              <p className="mt-1 text-sm text-ink-2">{c.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* C. Featured products */}
      <section className="page-x pb-16 sm:pb-20">
        <SectionHeading eyebrow="Featured" title="From the shop" href="/shop" linkLabel="View all products" />
        <ProductGrid products={featured} />
        <div className="mt-10 sm:hidden">
          <Link href="/shop" className="btn-ghost w-full">View all products</Link>
        </div>
      </section>

      {/* D. What to expect */}
      <section className="border-y border-line bg-surface">
        <div className="page-x grid gap-12 py-16 sm:py-20 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="eyebrow">Shopping with us</p>
            <h2 className="mt-2 text-3xl sm:text-4xl">What you can expect when you order</h2>
            <p className="mt-4 text-ink-2">
              {business.brandName} is an online store operated by {business.legalName}, based in Saint Louis, Missouri. Here is how we handle the parts of an order that matter most.
            </p>
            <Link href="/about" className="link mt-6 inline-block text-sm">More about us</Link>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
            <div>
              <dt className="font-medium">Clear product information</dt>
              <dd className="mt-1.5 text-sm leading-6 text-ink-2">Each listing includes materials, dimensions, care instructions and what&rsquo;s included, and notes when something like an insert or a plant isn&rsquo;t.</dd>
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
                Eligible items can be returned within <Setting value={returnWindow} label="return window" />{returnWindow !== null && " days"} of delivery. The full terms are in our <Link href="/return-policy" className="link">Return &amp; Refund Policy</Link>.
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

      {/* E. Everyday essentials */}
      <section className="page-x py-16 sm:py-20">
        <SectionHeading eyebrow="Everyday essentials" title="Small things that get used daily" href="/shop" linkLabel="Shop all" />
        <ProductGrid products={essentials} />
      </section>

      {/* F. Shopping information */}
      <section className="border-t border-line">
        <div className="page-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem icon={<LockIcon />} title="Secure checkout" href="/payment-policy" linkLabel="Payment policy">
            Accepted payment methods are shown at checkout. Payments are processed by our payment provider over an encrypted connection.
          </InfoItem>
          <InfoItem icon={<TruckIcon />} title="Shipping" href="/shipping-policy" linkLabel="Shipping policy">
            Orders are prepared within <Setting value={commerce.processingTime} label="processing time" />. Rates and delivery estimates appear at checkout.
          </InfoItem>
          <InfoItem icon={<MailIcon />} title="Customer support" href="/contact" linkLabel="Contact us">
            Email us about orders, products or deliveries
            {business.supportResponseTime ? <>. We reply {business.supportResponseTime}.</> : "."}
          </InfoItem>
          <InfoItem icon={<ReturnIcon />} title="Returns" href="/return-policy" linkLabel="Return policy">
            Contact customer support to start a return. We&rsquo;ll confirm eligibility and send instructions.
          </InfoItem>
        </div>
      </section>

      {/* G. Newsletter */}
      <section className="bg-ink text-paper">
        <div className="page-x grid items-center gap-8 py-14 sm:py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl sm:text-4xl">Get product updates and new arrivals.</h2>
            <p className="mt-3 text-paper/70">An occasional email when new products are added. No daily promotions.</p>
          </div>
          <div className="[&_.field]:border-paper/30 [&_.field]:bg-transparent [&_.field]:text-paper [&_.field]:placeholder:text-paper/50 [&_.field]:focus:border-paper [&_.btn-primary]:bg-paper [&_.btn-primary]:text-ink [&_.btn-primary]:hover:bg-surface [&_.link]:text-paper [&_p]:text-paper/60">
            <NewsletterForm />
          </div>
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
