import { describe, expect, it } from "vitest";

import { collections } from "@/catalog/collections";
import { products } from "@/catalog/products";

import { priceCart } from "./checkout";
import { searchProducts } from "./catalog";

describe("catalog integrity", () => {
  it("has unique SKUs, slugs and ids", () => {
    const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    expect(new Set(products.map((p) => p.id)).size).toBe(products.length);
  });

  it("references valid collections, options and images", () => {
    const slugs = new Set(collections.map((c) => c.slug));
    for (const p of products) {
      expect(slugs.has(p.collection)).toBe(true);
      expect(p.images.length).toBeGreaterThan(0);
      for (const v of p.variants) {
        expect(v.priceCents).toBeGreaterThan(0);
        for (const o of p.options) expect(o.values).toContain(v.options[o.name]);
        if (v.imageIndex !== undefined) expect(p.images[v.imageIndex]).toBeDefined();
        if (v.compareAtPriceCents !== undefined) expect(v.compareAtPriceCents).toBeGreaterThan(v.priceCents);
      }
    }
  });
});

describe("priceCart", () => {
  it("prices from the catalog, never the client", () => {
    const res = priceCart([{ sku: "CH-KD-MUG2-SND", quantity: 2 }]);
    expect(res.ok && res.subtotalCents).toBe(6800);
  });
  it("rejects unknown and out-of-stock SKUs", () => {
    expect(priceCart([{ sku: "NOPE", quantity: 1 }]).ok).toBe(false);
    expect(priceCart([{ sku: "CH-KD-MUG2-MOS", quantity: 1 }]).ok).toBe(false);
  });
});

describe("search", () => {
  it("matches names and tags", () => {
    expect(searchProducts("mug")[0].slug).toBe("stoneware-mug-set");
    expect(searchProducts("linen").length).toBeGreaterThan(0);
    expect(searchProducts("zzzz")).toEqual([]);
  });
});
