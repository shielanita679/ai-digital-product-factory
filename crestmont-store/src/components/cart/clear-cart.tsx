"use client";

import { useEffect } from "react";

import { useCart } from "./cart-provider";

/** Empties the cart once a paid order is confirmed. */
export function ClearCart() {
  const { clear, hydrated, lines } = useCart();
  useEffect(() => {
    if (hydrated && lines.length > 0) clear();
  }, [hydrated, lines.length, clear]);
  return null;
}
