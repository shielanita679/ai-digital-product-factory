import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { addressLines, business } from "@/config/business";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About Us",
  description: `${business.brandName} is an online store operated by ${business.legalName}, a Missouri limited liability company based in Saint Louis.`,
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <PageHeader title="About us" crumbs={[{ label: "About", href: "/about" }]} />
      <div className="page-x grid gap-12 py-12 sm:py-16 lg:grid-cols-12">
        <div className="prose-store lg:col-span-7">
          <p className="!mt-0 font-serif text-2xl leading-snug text-ink">
            {business.brandName} is an online store selling household goods for the kitchen, home, desk and travel. The store is operated by {business.legalName}, a {business.address.regionName} limited liability company.
          </p>

          <h2>What we sell</h2>
          <p>
            Our range is deliberately small: practical, everyday items in materials like stoneware, glass, wood, linen and canvas. We would rather offer a short list of products we can describe accurately than a long one we can&rsquo;t.
          </p>

          <h2>How we write product pages</h2>
          <p>
            Every listing includes materials, dimensions, care instructions and exactly what comes in the package. If something isn&rsquo;t included — a pillow insert, a plant — we say so. Prices shown on the site are the prices you pay for the items; shipping and any applicable tax are shown at checkout before you confirm payment.
          </p>

          <h2>Ordering and fulfillment</h2>
          <p>
            Orders are placed through our website and paid for on our payment processor&rsquo;s secure, hosted checkout. Once payment is confirmed, we prepare your order and send it to the shipping address you provided. Delivery estimates, carriers and costs are explained in our <Link href="/shipping-policy">Shipping Policy</Link>.
          </p>

          <h2>Customer support</h2>
          <p>
            If you have a question before or after you order — about a product, a delivery or a return — <Link href="/contact">contact us</Link> and include your order number if you have one. Returns are handled under our <Link href="/return-policy">Return &amp; Refund Policy</Link>.
          </p>

          <h2>Company details</h2>
          <address className="not-italic">
            <strong>{business.legalName}</strong>
            {addressLines().map((l) => (
              <span key={l} className="block">{l}</span>
            ))}
          </address>
          <p>
            Formed in the State of {business.stateOfFormation}, {business.countryOfFormation}.
          </p>
        </div>
        <div className="lg:col-span-5">
          <div className="overflow-hidden bg-surface lg:sticky lg:top-28">
            <Image src="/images/lifestyle/workspace.svg" alt="Felt desk pad, notebook, mug and planter arranged on a desk" width={1600} height={1000} sizes="(min-width: 1024px) 40vw, 100vw" className="aspect-[4/5] h-auto w-full object-cover" />
          </div>
        </div>
      </div>
    </>
  );
}
