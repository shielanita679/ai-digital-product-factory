import Link from "next/link";

import { absoluteUrl } from "@/config/business";
import { jsonLdString } from "@/lib/json-ld";

export type Crumb = { label: string; href: string };

/** Visible breadcrumb trail plus matching BreadcrumbList structured data. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all = [{ label: "Home", href: "/" }, ...items];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: absoluteUrl(c.href) })),
  };
  return (
    <nav aria-label="Breadcrumb" className="text-[0.8125rem] text-muted">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {all.map((c, i) => (
          <li key={c.href} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === all.length - 1 ? (
              <span aria-current="page" className="text-ink-2">{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:text-ink hover:underline hover:underline-offset-4">{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
