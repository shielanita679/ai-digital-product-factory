"use client";

import { createContext, use, useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { type CartCatalog, type CartLine, itemCount, normalizeLines, subtotalCents } from "@/lib/cart";

import { getServerSnapshot, getSnapshot, parseLines, subscribe, writeLines } from "./cart-store";

type CartContextValue = {
  catalog: CartCatalog;
  lines: CartLine[];
  count: number;
  subtotal: number;
  maxPerLine: number;
  hydrated: boolean;
  add: (sku: string, quantity?: number) => void;
  setQuantity: (sku: string, quantity: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const noopSubscribe = () => () => {};

export function CartProvider({ catalog, maxPerLine, children }: { catalog: CartCatalog; maxPerLine: number; children: React.ReactNode }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const lines = useMemo(() => normalizeLines(parseLines(raw), catalog, maxPerLine), [raw, catalog, maxPerLine]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const commit = useCallback(
    (next: CartLine[]) => writeLines(normalizeLines(next, catalog, maxPerLine)),
    [catalog, maxPerLine],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      catalog,
      lines,
      count: itemCount(lines),
      subtotal: subtotalCents(lines, catalog),
      maxPerLine,
      hydrated,
      add: (sku, quantity = 1) => commit([...lines, { sku, quantity }]),
      setQuantity: (sku, quantity) =>
        commit(quantity < 1 ? lines.filter((l) => l.sku !== sku) : lines.map((l) => (l.sku === sku ? { sku, quantity } : l))),
      remove: (sku) => commit(lines.filter((l) => l.sku !== sku)),
      clear: () => commit([]),
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [catalog, lines, maxPerLine, hydrated, commit, drawerOpen],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const ctx = use(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
