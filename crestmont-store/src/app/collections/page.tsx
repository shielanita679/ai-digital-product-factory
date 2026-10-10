import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { business } from "@/config/business";
import { getCollections, getProductsInCollection } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Collections",
  description: `Shop ${business.brandName} by collection: Kitchen & Dining, Home & Living, Desk & Office, and Travel & Carry.`,
  path: "/collections",
});

export default function CollectionsPage() {
  return (
    <>
      <PageHeader title="Collections" crumbs={[{ label: "Collections", href: "/collections" }]} intro={<p>Products grouped by where and how you&rsquo;ll use them.</p>} />
      <div className="page-x grid gap-12 py-12 sm:grid-cols-2 sm:gap-x-8 sm:py-16">
        {getCollections().map((c, i) => (
          <Link key={c.slug} href={`/collections/${c.slug}`} className="group block">
            <div className="overflow-hidden bg-surface">
              <Image src={c.image.src} alt={c.image.alt} width={c.image.width} height={c.image.height} preload={i < 2} sizes="(min-width: 640px) 50vw, 100vw" className="aspect-[4/3] h-auto w-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.02]" />
            </div>
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <h2 className="text-2xl sm:text-3xl">{c.name}</h2>
              <span className="text-[0.8125rem] text-muted">{getProductsInCollection(c.slug).length} products</span>
            </div>
            <p className="mt-1.5 text-ink-2">{c.description}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-sm group-hover:underline group-hover:underline-offset-4">
              Shop {c.name} <ArrowRightIcon size={16} />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
