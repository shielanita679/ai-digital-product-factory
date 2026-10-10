import type { Product } from "@/catalog/types";
import { formatMoney } from "@/config/commerce";
import { priceRange } from "@/lib/catalog";

export function Price({ cents, compareAtCents, className = "" }: { cents: number; compareAtCents?: number; className?: string }) {
  const onSale = compareAtCents !== undefined && compareAtCents > cents;
  return (
    <span className={`inline-flex items-baseline gap-2 tabular-nums ${className}`}>
      <span>{formatMoney(cents)}</span>
      {onSale && (
        <>
          <span className="sr-only">Previously</span>
          <s className="text-muted">{formatMoney(compareAtCents)}</s>
        </>
      )}
    </span>
  );
}

/** Card-level price: "From $X" when variants are priced differently. */
export function ProductPrice({ product }: { product: Product }) {
  const { min, max } = priceRange(product);
  const cheapest = product.variants.find((v) => v.priceCents === min);
  if (min !== max) return <span className="tabular-nums">From {formatMoney(min)}</span>;
  return <Price cents={min} compareAtCents={cheapest?.compareAtPriceCents} />;
}
