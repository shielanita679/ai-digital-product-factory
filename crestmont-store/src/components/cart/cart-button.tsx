"use client";

import { BagIcon } from "@/components/icons";

import { useCart } from "./cart-provider";

export function CartButton() {
  const { count, openDrawer, hydrated } = useCart();
  const label = hydrated && count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart";
  return (
    <button type="button" onClick={openDrawer} className="relative grid size-10 place-items-center" aria-label={label}>
      <BagIcon />
      {hydrated && count > 0 && (
        <span className="absolute top-1 right-0.5 grid min-w-4 place-items-center rounded-full bg-ink px-1 text-[0.625rem] leading-4 font-medium text-paper tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}
