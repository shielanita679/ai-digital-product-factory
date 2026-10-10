import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ProductGrid } from "@/components/product/product-card";
import { parseSort, SortLinks } from "@/components/product/sort-links";
import { business } from "@/config/business";
import { getCollectionBySlug, getCollections, getProductsInCollection, sortProducts } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return getCollections().map((c) => ({ slug: c.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const collection = getCollectionBySlug(slug);
  if (!collection) return {};
  return pageMetadata({
    title: collection.name,
    description: `${collection.description} Shop the ${collection.name} collection at ${business.brandName}.`,
    path: `/collections/${slug}`,
    image: collection.image?.src,
  });
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const collection = getCollectionBySlug(slug);
  if (!collection) notFound();
  const sort = parseSort((await searchParams).sort);
  const products = sortProducts(getProductsInCollection(slug), sort);

  return (
    <>
      <PageHeader
        title={collection.name}
        crumbs={[{ label: "Collections", href: "/collections" }, { label: collection.name, href: `/collections/${slug}` }]}
        intro={<p>{collection.description}</p>}
      />
      <div className="page-x py-8 sm:py-10">
        <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-wrap gap-2" aria-label="Collections">
            <li>
              <Link href="/shop" className="inline-flex min-h-9 items-center border border-line-strong px-3.5 text-[0.8125rem] hover:border-ink">All</Link>
            </li>
            {getCollections().map((c) => (
              <li key={c.slug}>
                {c.slug === slug ? (
                  <span aria-current="page" className="inline-flex min-h-9 items-center border border-ink bg-ink px-3.5 text-[0.8125rem] text-paper">{c.name}</span>
                ) : (
                  <Link href={`/collections/${c.slug}`} className="inline-flex min-h-9 items-center border border-line-strong px-3.5 text-[0.8125rem] hover:border-ink">{c.name}</Link>
                )}
              </li>
            ))}
          </ul>
          <SortLinks current={sort} basePath={`/collections/${slug}`} />
        </div>
        <p className="mb-6 text-[0.8125rem] text-muted">{products.length} products</p>
        {products.length > 0 ? (
          <ProductGrid products={products} priorityCount={4} />
        ) : (
          <p className="py-16 text-center text-ink-2">There are no products in this collection right now. <Link href="/shop" className="link">Browse all products</Link>.</p>
        )}
      </div>
    </>
  );
}
