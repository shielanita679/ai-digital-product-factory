import { describe, expect, it } from "vitest";

import { products } from "@/catalog/products";
import { commerce } from "@/config/commerce";

import { sortProducts } from "./catalog";
import { getCheckoutBlockers, isCheckoutEnabled } from "./launch";
import { resolutionsPhrase } from "./policy-text";

describe("pre-launch safeguards", () => {
  it("keeps payments switched off and checkout closed", () => {
    expect(commerce.paymentsEnabled).toBe(false);
    expect(isCheckoutEnabled()).toBe(false);
    expect(getCheckoutBlockers().some((b) => b.includes("Payments are disabled"))).toBe(true);
  });

  it("has no active products and no inventory", () => {
    expect(products.filter((p) => p.status === "active")).toEqual([]);
    expect(products.flatMap((p) => p.variants)).toEqual([]);
  });

  it("price sorting never reorders pre-launch products by their planned price", () => {
    const original = products.filter((p) => p.status === "coming_soon").map((p) => p.id);
    expect(sortProducts(products, "price-asc").map((p) => p.id)).toEqual(original);
    expect(sortProducts(products, "price-desc").map((p) => p.id)).toEqual(original);
  });
});

describe("operating terms", () => {
  it("matches the proposed policies", () => {
    expect(commerce.processingTime).toBe("1–2 business days");
    expect(commerce.domesticDeliveryEstimate).toBe("3–7 business days");
    expect(commerce.international.enabled).toBe(false);
    expect(commerce.freeShippingThresholdCents).toBeNull();
    expect(commerce.returns.windowDays).toBe(30);
    expect(commerce.returns.restockingFeePercent).toBe(0);
    expect(commerce.returns.returnShippingPaidBy).toBe("customer");
    expect(commerce.returns.exchangesOffered).toBe(false);
    expect(resolutionsPhrase()).toBe("a replacement, a refund or another appropriate resolution");
  });
});
