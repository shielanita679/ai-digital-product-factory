import { describe, expect, it } from "vitest";

import type { PricedLine } from "@/lib/checkout";

import { buildOrderItemsSnapshot } from "./snapshot";

describe("order item snapshot", () => {
  it("copies purchase-time values, independent of later catalog edits", () => {
    const line: PricedLine = { productId: "p-1", sku: "CH-TEST-BLK", name: "Original Name", variant: "Black", unitAmountCents: 2999, quantity: 2, image: "" };
    const snapshot = buildOrderItemsSnapshot([line]);
    line.name = "Renamed";
    line.unitAmountCents = 3999;
    expect(snapshot).toEqual([{ productId: "p-1", sku: "CH-TEST-BLK", productName: "Original Name", variantName: "Black", quantity: 2, unitAmount: 2999 }]);
  });
});
