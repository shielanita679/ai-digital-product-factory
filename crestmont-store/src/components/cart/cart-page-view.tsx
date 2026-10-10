"use client";

import Link from "next/link";

import { formatMoney } from "@/config/commerce";

import { CartLines } from "./cart-lines";
import { useCart } from "./cart-provider";

export function CartPageView() {
  const { lines, subtotal, count, hydrated } = useCart();

  if (!hydrated) return <div className="h-64" aria-busy="true" />;

  if (lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-ink-2">Your cart is empty.</p>
        <Link href="/shop" className="btn-primary mt-6">Browse the shop</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="hidden border-b border-line pb-3 text-[0.8125rem] text-muted sm:flex sm:justify-between">
          <span>Product</span>
          <span>Total</span>
        </div>
        <CartLines />
      </div>
      <aside className="lg:col-span-4" aria-label="Order summary">
        <div className="border border-line bg-surface p-6 lg:sticky lg:top-28">
          <h2 className="font-serif text-2xl">Summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal ({count} {count === 1 ? "item" : "items"})</dt>
              <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-ink-2">
              <dt>Shipping</dt>
              <dd>Calculated at checkout</dd>
            </div>
            <div className="flex justify-between text-ink-2">
              <dt>Taxes</dt>
              <dd>Calculated at checkout</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-medium">
              <dt>Estimated total</dt>
              <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[0.8125rem] text-muted">Taxes and shipping calculated at checkout.</p>
          <Link href="/checkout" className="btn-primary mt-6 w-full">Checkout</Link>
          <Link href="/shop" className="mt-3 block text-center text-sm underline underline-offset-4">Continue shopping</Link>
        </div>
      </aside>
    </div>
  );
}
