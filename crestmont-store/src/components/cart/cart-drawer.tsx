"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { CloseIcon } from "@/components/icons";
import { formatMoney } from "@/config/commerce";

import { CartLines } from "./cart-lines";
import { useCart } from "./cart-provider";

export function CartDrawer() {
  const { drawerOpen, closeDrawer, lines, subtotal } = useCart();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  return (
    <dialog
      ref={ref}
      onClose={closeDrawer}
      onClick={(e) => e.target === e.currentTarget && closeDrawer()}
      aria-label="Shopping cart"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-md bg-paper p-0 text-ink backdrop:bg-ink/30 open:flex open:flex-col"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-serif text-xl">Your cart</h2>
        <button type="button" onClick={closeDrawer} className="-mr-2 grid size-10 place-items-center" aria-label="Close cart">
          <CloseIcon />
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="text-muted">Your cart is empty.</p>
          <Link href="/shop" onClick={closeDrawer} className="btn-primary">
            Browse the shop
          </Link>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5">
            <CartLines compact onNavigate={closeDrawer} />
          </div>
          <div className="border-t border-line px-5 pt-4 pb-6">
            <div className="flex items-baseline justify-between">
              <span className="text-sm">Subtotal</span>
              <span className="text-base font-medium tabular-nums">{formatMoney(subtotal)}</span>
            </div>
            <p className="mt-1 text-[0.8125rem] text-muted">Taxes and shipping calculated at checkout.</p>
            <div className="mt-4 grid gap-2">
              <Link href="/checkout" onClick={closeDrawer} className="btn-primary w-full">
                Checkout
              </Link>
              <Link href="/cart" onClick={closeDrawer} className="btn-ghost w-full">
                View cart
              </Link>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
