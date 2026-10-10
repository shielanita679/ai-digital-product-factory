import type { Metadata } from "next";
import Link from "next/link";

import { SearchIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="page-x max-w-2xl py-20 sm:py-28">
      <p className="eyebrow">Error 404</p>
      <h1 className="mt-3 text-4xl sm:text-5xl">We can&rsquo;t find that page</h1>
      <p className="mt-4 text-ink-2">The link may be out of date, or the page may have moved. Try searching the shop or head back to the home page.</p>
      <form action="/search" role="search" className="mt-8 flex gap-2">
        <label htmlFor="nf-q" className="sr-only">Search products</label>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" size={18} />
          <input id="nf-q" name="q" type="search" placeholder="Search products" className="field pl-10" />
        </div>
        <button type="submit" className="btn-primary">Search</button>
      </form>
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/" className="link">Home</Link>
        <Link href="/shop" className="link">Shop all products</Link>
        <Link href="/collections" className="link">Collections</Link>
        <Link href="/contact" className="link">Contact us</Link>
      </div>
    </div>
  );
}
