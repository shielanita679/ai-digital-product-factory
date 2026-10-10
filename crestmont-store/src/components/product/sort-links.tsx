import Link from "next/link";

import type { SortKey } from "@/lib/catalog";

export const sorts: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Default" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "name", label: "Name, A–Z" },
];

export function parseSort(value: string | string[] | undefined): SortKey {
  return sorts.find((s) => s.value === value)?.value ?? "featured";
}

export function SortLinks({ current, basePath }: { current: SortKey; basePath: string }) {
  return (
    <nav aria-label="Sort products" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem]">
      <span className="text-muted">Sort:</span>
      {sorts.map((s) => (
        <Link
          key={s.value}
          href={s.value === "featured" ? basePath : `${basePath}?sort=${s.value}`}
          aria-current={s.value === current ? "true" : undefined}
          className={s.value === current ? "font-medium text-ink underline underline-offset-4" : "text-ink-2 hover:text-ink"}
          scroll={false}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
