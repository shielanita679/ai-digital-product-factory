import { commerce, type ShippingRate } from "@/config/commerce";
import { findVariantBySku, variantLabel } from "@/lib/catalog";
import type { CartLine } from "@/lib/cart";

export type PricedLine = {
  productId: string;
  sku: string;
  name: string;
  variant: string;
  unitAmountCents: number;
  quantity: number;
  image: string;
};

/**
 * Re-prices a cart against the catalog. Never trusts prices, names, stock or
 * subtotals from the browser — only SKUs and quantities.
 *
 * `checkCatalogStock`: when the order database is enabled, stock is enforced
 * authoritatively by the database reservation, so the catalog's seed
 * inventory figure is not used.
 */
export function priceCart(lines: CartLine[], { checkCatalogStock = true }: { checkCatalogStock?: boolean } = {}): { ok: true; lines: PricedLine[]; subtotalCents: number } | { ok: false; error: string } {
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.sku, (merged.get(l.sku) ?? 0) + l.quantity);

  const priced: PricedLine[] = [];
  for (const [sku, quantity] of merged) {
    const found = findVariantBySku(sku);
    if (!found) return { ok: false, error: "An item in your cart is no longer available. Please review your cart." };
    const { product, variant } = found;
    if (checkCatalogStock && variant.inventory < 1) return { ok: false, error: `${product.name} (${variantLabel(variant) || "selected option"}) is out of stock.` };
    if ((checkCatalogStock && quantity > variant.inventory) || quantity > commerce.maxQuantityPerLine) {
      return { ok: false, error: `The quantity requested for ${product.name} isn't available. Please lower the quantity.` };
    }
    priced.push({
      productId: product.id,
      sku,
      name: product.name,
      variant: variantLabel(variant),
      unitAmountCents: variant.priceCents,
      quantity,
      image: product.images[variant.imageIndex ?? 0]?.src ?? product.images[0]?.src ?? "",
    });
  }
  const subtotalCents = priced.reduce((s, l) => s + l.unitAmountCents * l.quantity, 0);
  return { ok: true, lines: priced, subtotalCents };
}

/** Shipping options for a given subtotal, applying the free-shipping threshold if one is set. */
export function shippingOptionsFor(subtotalCents: number): ShippingRate[] {
  const threshold = commerce.freeShippingThresholdCents;
  return commerce.shippingRates.map((rate, i) =>
    i === 0 && threshold !== null && subtotalCents >= threshold ? { ...rate, label: `Free ${rate.label.toLowerCase()}`, amountCents: 0 } : rate,
  );
}
