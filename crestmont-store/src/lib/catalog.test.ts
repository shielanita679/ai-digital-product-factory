import { describe, expect, it } from "vitest";

import { collections } from "@/catalog/collections";
import { products } from "@/catalog/products";
import type { Product } from "@/catalog/types";

import { activationIssues, findVariantBySku, getPurchasableProducts, getVisibleProducts, isPurchasable, searchProducts } from "./catalog";
import { priceCart } from "./checkout";

const complete: Product = {
  id: "t-1",
  slug: "test-product",
  name: "Test Product",
  collection: "kitchen-dining",
  status: "active",
  skuPrefix: "CH-TEST",
  priceCents: 1000,
  summary: "Test.",
  description: ["Test."],
  specifications: [{ label: "Material", value: "Test" }],
  included: ["1 item"],
  returnable: true,
  options: [{ name: "Color", values: ["Black"] }],
  variants: [{ sku: "CH-TEST-BLK", options: { Color: "Black" }, priceCents: 1000, inventory: 3 }],
  images: [{ src: "/x.jpg", alt: "x", width: 10, height: 10 }],
  weight: { value: 1, unit: "lb" },
  dimensions: { length: 1, width: 1, height: 1, unit: "in" },
  tags: [],
  pendingData: [],
};

describe("catalog integrity", () => {
  it("has unique ids, slugs, SKU prefixes and SKUs", () => {
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    expect(unique(products.map((p) => p.id))).toBe(true);
    expect(unique(products.map((p) => p.slug))).toBe(true);
    expect(unique(products.map((p) => p.skuPrefix))).toBe(true);
    expect(unique(products.flatMap((p) => p.variants.map((v) => v.sku)))).toBe(true);
  });

  it("references valid collections, and every collection has products", () => {
    const slugs = new Set(collections.map((c) => c.slug));
    for (const p of products) expect(slugs.has(p.collection)).toBe(true);
    for (const c of collections) expect(products.some((p) => p.collection === c.slug)).toBe(true);
  });

  it("only marks products active when all required data is present", () => {
    for (const p of products.filter((p) => p.status === "active")) expect(activationIssues(p)).toEqual([]);
  });

  it("lists outstanding data for every pre-launch product", () => {
    for (const p of products.filter((p) => p.status === "coming_soon" || p.status === "draft")) {
      expect(p.pendingData.length).toBeGreaterThan(0);
    }
  });

  it("has no unverified inventory or SKUs on pre-launch products", () => {
    for (const p of products.filter((p) => p.status !== "active")) expect(p.variants).toEqual([]);
  });
});

describe("purchasability", () => {
  it("accepts a complete active product", () => {
    expect(activationIssues(complete)).toEqual([]);
    expect(isPurchasable(complete)).toBe(true);
  });

  it("rejects coming-soon, draft and incomplete products", () => {
    expect(isPurchasable({ ...complete, status: "coming_soon" })).toBe(false);
    expect(isPurchasable({ ...complete, status: "draft" })).toBe(false);
    expect(isPurchasable({ ...complete, images: [] })).toBe(false);
    expect(isPurchasable({ ...complete, pendingData: ["capacity"] })).toBe(false);
    expect(isPurchasable({ ...complete, variants: [{ ...complete.variants[0], sku: "OTHER-1" }] })).toBe(false);
    expect(isPurchasable({ ...complete, variants: [{ ...complete.variants[0], inventory: -1 }] })).toBe(false);
  });

  it("shows coming-soon products but never lets them be bought", () => {
    const comingSoon = products.filter((p) => p.status === "coming_soon");
    expect(getVisibleProducts().length).toBeGreaterThanOrEqual(comingSoon.length);
    for (const p of comingSoon) expect(getPurchasableProducts()).not.toContain(p);
    expect(findVariantBySku("CH-KIT-SCALE")).toBeUndefined();
  });
});

describe("priceCart", () => {
  it("rejects SKUs that aren't purchasable", () => {
    expect(priceCart([{ sku: "CH-KIT-SCALE", quantity: 1 }]).ok).toBe(false);
    expect(priceCart([{ sku: "NOPE", quantity: 1 }]).ok).toBe(false);
  });
});

describe("search", () => {
  it("matches names and tags", () => {
    expect(searchProducts("scale")[0].slug).toBe("digital-kitchen-scale");
    expect(searchProducts("organizer").length).toBeGreaterThan(1);
    expect(searchProducts("zzzz")).toEqual([]);
  });
});
