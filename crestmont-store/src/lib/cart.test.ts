import { describe, expect, it } from "vitest";

import { type CartCatalog, itemCount, normalizeLines, subtotalCents } from "./cart";

const catalog: CartCatalog = {
  A: { sku: "A", productName: "A", productSlug: "a", variantLabel: "", priceCents: 1000, inventory: 5, image: { src: "", alt: "" } },
  B: { sku: "B", productName: "B", productSlug: "b", variantLabel: "", priceCents: 250, inventory: 0, image: { src: "", alt: "" } },
};

describe("cart", () => {
  it("merges duplicates, clamps to inventory and drops unknown or out-of-stock SKUs", () => {
    const lines = normalizeLines(
      [
        { sku: "A", quantity: 3 },
        { sku: "A", quantity: 4 },
        { sku: "B", quantity: 1 },
        { sku: "Z", quantity: 1 },
      ],
      catalog,
      10,
    );
    expect(lines).toEqual([{ sku: "A", quantity: 5 }]);
  });

  it("computes subtotal and count from catalog prices", () => {
    const lines = [{ sku: "A", quantity: 2 }];
    expect(subtotalCents(lines, catalog)).toBe(2000);
    expect(itemCount(lines)).toBe(2);
  });
});
