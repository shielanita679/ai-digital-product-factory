import type { Metadata } from "next";
import Link from "next/link";

import { SearchIcon } from "@/components/icons";
import { ProductGrid } from "@/components/product/product-card";
import { getCollections, searchProducts } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Search", description: "Search the shop by product name, material or category.", path: "/search" }),
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const raw = (await searchParams).q;
  const query = (typeof raw === "string" ? raw : "").slice(0, 100).trim();
  const results = query ? searchProducts(query) : [];

  return (
    <div className="page-x py-10 sm:py-14">
      <h1 className="text-4xl sm:text-5xl">Search</h1>
      <form action="/search" role="search" className="mt-6 flex max-w-2xl gap-2">
        <label htmlFor="q" className="sr-only">Search products</label>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" size={18} />
          <input id="q" name="q" type="search" defaultValue={query} autoFocus={!query} placeholder="Search products, materials, rooms…" maxLength={100} className="field pl-10" />
        </div>
        <button type="submit" className="btn-primary">Search</button>
      </form>

      <div className="mt-10">
        {query === "" ? (
          <div>
            <p className="text-ink-2">Try a product type like &ldquo;mug&rdquo;, a material like &ldquo;linen&rdquo;, or browse a collection:</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {getCollections().map((c) => (
                <li key={c.slug}>
                  <Link href={`/collections/${c.slug}`} className="inline-flex min-h-9 items-center border border-line-strong px-3.5 text-[0.8125rem] hover:border-ink">{c.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        ) : results.length === 0 ? (
          <div>
            <p className="text-ink-2">No products match &ldquo;{query}&rdquo;. Check the spelling or try a broader term.</p>
            <Link href="/shop" className="btn-ghost mt-6">Browse all products</Link>
          </div>
        ) : (
          <>
            <p className="mb-6 text-[0.8125rem] text-muted" role="status">
              {results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
            </p>
            <ProductGrid products={results} />
          </>
        )}
      </div>
    </div>
  );
}
