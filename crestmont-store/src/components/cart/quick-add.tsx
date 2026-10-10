"use client";

import { useRef, useState } from "react";

import { CloseIcon } from "@/components/icons";

import { useCart } from "./cart-provider";

export type QuickAddVariant = { sku: string; label: string; inStock: boolean };

/**
 * Adds a product to the cart from a product card. Single-variant products
 * are added directly; otherwise a small dialog lets the shopper pick a variant.
 */
export function QuickAdd({ productName, variants }: { productName: string; variants: QuickAddVariant[] }) {
  const { add, openDrawer } = useCart();
  const dialog = useRef<HTMLDialogElement>(null);
  const [added, setAdded] = useState(false);
  const anyInStock = variants.some((v) => v.inStock);

  const addSku = (sku: string) => {
    add(sku, 1);
    dialog.current?.close();
    setAdded(true);
    openDrawer();
    window.setTimeout(() => setAdded(false), 1500);
  };

  if (!anyInStock) {
    return (
      <button type="button" disabled className="btn-ghost min-h-10 w-full px-3 text-[0.8125rem]">
        Out of stock
      </button>
    );
  }

  const single = variants.length === 1;
  return (
    <>
      <button
        type="button"
        className="btn-ghost min-h-10 w-full px-3 text-[0.8125rem]"
        onClick={() => (single ? addSku(variants[0].sku) : dialog.current?.showModal())}
        aria-label={`Quick add ${productName}`}
      >
        {added ? "Added" : "Quick add"}
      </button>
      {!single && (
        <dialog
          ref={dialog}
          onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
          className="m-auto w-[min(26rem,calc(100%-2rem))] bg-paper p-0 text-ink backdrop:bg-ink/30"
          aria-label={`Choose an option for ${productName}`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <p className="eyebrow">Choose an option</p>
              <p className="mt-1 font-serif text-lg leading-snug">{productName}</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} className="-mr-2 grid size-10 shrink-0 place-items-center" aria-label="Close">
              <CloseIcon />
            </button>
          </div>
          <ul className="grid gap-2 p-5">
            {variants.map((v) => (
              <li key={v.sku}>
                <button
                  type="button"
                  disabled={!v.inStock}
                  onClick={() => addSku(v.sku)}
                  className="flex min-h-11 w-full items-center justify-between border border-line-strong px-4 text-left text-sm hover:border-ink disabled:cursor-not-allowed disabled:text-muted disabled:hover:border-line-strong"
                >
                  <span>{v.label}</span>
                  <span className="text-[0.8125rem] text-muted">{v.inStock ? "Add" : "Out of stock"}</span>
                </button>
              </li>
            ))}
          </ul>
        </dialog>
      )}
    </>
  );
}
