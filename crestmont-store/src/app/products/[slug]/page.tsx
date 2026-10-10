import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductGrid } from "@/components/product/product-card";
import { ProductExperience } from "@/components/product/product-experience";
import { Setting } from "@/components/setting";
import { absoluteUrl, business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { defaultVariant, getActiveProducts, getCollectionBySlug, getProductBySlug, getRelatedProducts, variantLabel } from "@/lib/catalog";
import { jsonLdString } from "@/lib/json-ld";
import { pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return getActiveProducts().map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return {};
  const image = product.images[0].src;
  return pageMetadata({
    title: product.name,
    description: product.summary,
    path: `/products/${slug}`,
    image: image.endsWith(".svg") ? undefined : image,
  });
}

function Detail({ title, open = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-lg leading-none text-muted transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="pb-5 text-sm leading-6 text-ink-2">{children}</div>
    </details>
  );
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const collection = getCollectionBySlug(product.collection);
  const related = getRelatedProducts(product, 4);
  const url = absoluteUrl(`/products/${product.slug}`);

  // Product structured data built from real catalog values only — no ratings or reviews.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary,
    image: product.images.map((i) => absoluteUrl(i.src)),
    url,
    brand: { "@type": "Brand", name: business.brandName },
    ...(product.variants.length === 1 ? { sku: product.variants[0].sku } : {}),
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      name: [product.name, variantLabel(v)].filter(Boolean).join(" — "),
      price: (v.priceCents / 100).toFixed(2),
      priceCurrency: commerce.currency,
      availability: v.inventory > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      url,
      seller: { "@type": "Organization", name: business.legalName },
    })),
  };

  const returnWindow = commerce.returns.windowDays;

  return (
    <div className="page-x py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(productJsonLd) }} />

      <ProductExperience
        product={product}
        initialSku={defaultVariant(product).sku}
        header={
          <>
            <Breadcrumbs
              items={[
                ...(collection ? [{ label: collection.name, href: `/collections/${collection.slug}` }] : [{ label: "Shop", href: "/shop" }]),
                { label: product.name, href: `/products/${product.slug}` },
              ]}
            />
            <h1 className="mt-5 text-3xl sm:text-4xl">{product.name}</h1>
            <p className="mt-3 text-ink-2">{product.summary}</p>
          </>
        }
      >
        <div className="mt-10 border-t border-line">
          <Detail title="Description" open>
            {product.description.map((p) => (
              <p key={p.slice(0, 32)} className="mb-3 last:mb-0">{p}</p>
            ))}
          </Detail>
          <Detail title="Features">
            <ul className="list-disc space-y-1 pl-5 marker:text-line-strong">
              {product.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </Detail>
          <Detail title="Specifications">
            <dl className="divide-y divide-line">
              {product.specifications.map((s) => (
                <div key={s.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-2">
                  <dt className="text-muted">{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-2">
                <dt className="text-muted">Shipping weight</dt>
                <dd>{product.weight.value} {product.weight.unit}</dd>
              </div>
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 py-2">
                <dt className="text-muted">Package size</dt>
                <dd>{product.dimensions.length} × {product.dimensions.width} × {product.dimensions.height} {product.dimensions.unit}</dd>
              </div>
            </dl>
          </Detail>
          <Detail title="What's included">
            <ul className="list-disc space-y-1 pl-5 marker:text-line-strong">
              {product.included.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </Detail>
          {product.care && product.care.length > 0 && (
            <Detail title="Care">
              <ul className="list-disc space-y-1 pl-5 marker:text-line-strong">
                {product.care.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </Detail>
          )}
          <Detail title="Shipping">
            <p>
              Orders are prepared for shipment within <Setting value={commerce.processingTime} label="processing time" />. Domestic delivery typically takes <Setting value={commerce.domesticDeliveryEstimate} label="delivery estimate" /> after dispatch. Shipping options and costs are shown at checkout before you pay.
            </p>
            {product.shippingNote && <p className="mt-3">{product.shippingNote}</p>}
            <Link href="/shipping-policy" className="link mt-3 inline-block">Shipping policy</Link>
          </Detail>
          <Detail title="Returns">
            {product.returnable ? (
              <p>
                This item can be returned within <Setting value={returnWindow} label="return window" />{returnWindow !== null && " days"} of delivery if it&rsquo;s unused and in its original packaging. Contact customer support to start a return.
              </p>
            ) : (
              <p>This item is final sale and can&rsquo;t be returned for a change of mind. Damaged, defective or incorrect items are still covered.</p>
            )}
            <Link href="/return-policy" className="link mt-3 inline-block">Return &amp; Refund Policy</Link>
          </Detail>
        </div>
      </ProductExperience>

      {related.length > 0 && (
        <section className="mt-20 border-t border-line pt-14 sm:mt-24">
          <h2 className="mb-8 text-3xl">You may also like</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
