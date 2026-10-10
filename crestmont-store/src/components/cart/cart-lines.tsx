"use client";

import Image from "next/image";
import Link from "next/link";

import { MinusIcon, PlusIcon } from "@/components/icons";
import { formatMoney } from "@/config/commerce";

import { useCart } from "./cart-provider";

/** Line items with quantity controls. Shared by the cart drawer and cart page. */
export function CartLines({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { lines, catalog, setQuantity, remove, maxPerLine } = useCart();

  return (
    <ul className="divide-y divide-line">
      {lines.map((line) => {
        const item = catalog[line.sku];
        const max = Math.min(maxPerLine, item.inventory);
        return (
          <li key={line.sku} className="flex gap-4 py-5">
            <Link href={`/products/${item.productSlug}`} onClick={onNavigate} className="shrink-0 self-start overflow-hidden bg-surface">
              <Image src={item.image.src} alt={item.image.alt} width={compact ? 80 : 112} height={compact ? 100 : 140} className="h-auto" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/products/${item.productSlug}`} onClick={onNavigate} className="text-sm font-medium text-ink hover:underline">
                    {item.productName}
                  </Link>
                  {item.variantLabel && <p className="mt-0.5 text-[0.8125rem] text-muted">{item.variantLabel}</p>}
                  <p className="mt-0.5 text-[0.8125rem] text-muted">
                    {formatMoney(item.priceCents)} each
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">{formatMoney(item.priceCents * line.quantity)}</p>
              </div>
              <div className="mt-auto flex items-center justify-between pt-3">
                <div className="inline-flex items-center border border-line-strong">
                  <button type="button" className="grid size-9 place-items-center hover:bg-surface" onClick={() => setQuantity(line.sku, line.quantity - 1)} aria-label={`Decrease quantity of ${item.productName}`}>
                    <MinusIcon size={14} />
                  </button>
                  <span className="w-8 text-center text-sm tabular-nums" aria-live="polite" aria-label={`Quantity ${line.quantity}`}>
                    {line.quantity}
                  </span>
                  <button type="button" className="grid size-9 place-items-center hover:bg-surface disabled:opacity-40" onClick={() => setQuantity(line.sku, line.quantity + 1)} disabled={line.quantity >= max} aria-label={`Increase quantity of ${item.productName}`}>
                    <PlusIcon size={14} />
                  </button>
                </div>
                <button type="button" onClick={() => remove(line.sku)} className="text-[0.8125rem] text-muted underline underline-offset-4 hover:text-ink">
                  Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
