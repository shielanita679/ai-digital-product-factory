/**
 * Cart data shared by the client cart and the server checkout route.
 * The client only ever stores SKUs and quantities; prices always come from
 * the catalog, and the server re-prices everything before payment.
 */

export type CartLine = { sku: string; quantity: number };

/** Minimal per-variant data the browser needs to render the cart. */
export type CartCatalogEntry = {
  sku: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  priceCents: number;
  inventory: number;
  image: { src: string; alt: string };
};

export type CartCatalog = Record<string, CartCatalogEntry>;

export function clampQuantity(quantity: number, max: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(Math.floor(quantity), max));
}

/** Merges duplicate SKUs and drops lines that are no longer sellable. */
export function normalizeLines(lines: CartLine[], catalog: CartCatalog, maxPerLine: number): CartLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!line || typeof line.sku !== "string" || !catalog[line.sku]) continue;
    merged.set(line.sku, (merged.get(line.sku) ?? 0) + (Number(line.quantity) || 0));
  }
  const out: CartLine[] = [];
  for (const [sku, qty] of merged) {
    const entry = catalog[sku];
    const max = Math.min(maxPerLine, entry.inventory);
    if (max < 1) continue;
    out.push({ sku, quantity: clampQuantity(qty, max) });
  }
  return out;
}

export function subtotalCents(lines: CartLine[], catalog: CartCatalog): number {
  return lines.reduce((sum, l) => sum + (catalog[l.sku]?.priceCents ?? 0) * l.quantity, 0);
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}
