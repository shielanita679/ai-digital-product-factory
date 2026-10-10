import type { Metadata } from "next";

import { CollectionTile } from "@/components/collection-tile";
import { PageHeader } from "@/components/page-header";
import { business } from "@/config/business";
import { getCollections, getProductsInCollection } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

const collections = getCollections();

export const metadata: Metadata = pageMetadata({
  title: "Collections",
  description: `Shop ${business.brandName} by collection: ${collections.map((c) => c.name).join(", ")}.`,
  path: "/collections",
});

export default function CollectionsPage() {
  return (
    <>
      <PageHeader title="Collections" crumbs={[{ label: "Collections", href: "/collections" }]} intro={<p>Home and everyday living products, grouped by where and how they&rsquo;re used.</p>} />
      <div className="page-x grid gap-12 py-12 sm:grid-cols-2 sm:gap-x-8 sm:py-16">
        {collections.map((c, i) => (
          <CollectionTile key={c.slug} collection={c} index={i} count={getProductsInCollection(c.slug).length} priority={i < 2} large />
        ))}
      </div>
    </>
  );
}
