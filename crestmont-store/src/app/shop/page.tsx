import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ProductGrid } from "@/components/product/product-card";
import { parseSort, SortLinks } from "@/components/product/sort-links";
import { business } from "@/config/business";
import { getActiveProducts, getCollections, sortProducts } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Shop All Products",
  description: `Browse every product from ${business.brandName}: kitchen, home, desk and travel goods with full specifications and clear pricing.`,
  path: "/shop",
});


export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const products = sortProducts(getActiveProducts(), sort);

  return (
    <>
      <PageHeader title="All products" crumbs={[{ label: "Shop", href: "/shop" }]} intro={<p>Everything currently in the shop. Use a collection to narrow things down.</p>} />
      <div className="page-x py-8 sm:py-10">
        <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-wrap gap-2" aria-label="Collections">
            <li><span className="inline-flex min-h-9 items-center border border-ink bg-ink px-3.5 text-[0.8125rem] text-paper">All</span></li>
            {getCollections().map((c) => (
              <li key={c.slug}>
                <Link href={`/collections/${c.slug}`} className="inline-flex min-h-9 items-center border border-line-strong px-3.5 text-[0.8125rem] hover:border-ink">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <SortLinks current={sort} basePath="/shop" />
        </div>
        <p className="mb-6 text-[0.8125rem] text-muted">{products.length} products</p>
        <ProductGrid products={products} priorityCount={4} />
      </div>
    </>
  );
}
