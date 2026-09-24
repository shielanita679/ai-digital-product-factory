import { describe, it, expect } from "vitest";

import { FREE_SIGNUP_CREDITS, CREDIT_COSTS, CREDIT_ENTRY_TYPE_VALUES, creditEntryTypeLabel } from "@/config/credits";

describe("credit cost/grant configuration", () => {
  it("FREE_SIGNUP_CREDITS is a positive integer", () => {
    expect(Number.isInteger(FREE_SIGNUP_CREDITS)).toBe(true);
    expect(FREE_SIGNUP_CREDITS).toBeGreaterThan(0);
  });

  it("every generation cost is a positive integer", () => {
    for (const cost of Object.values(CREDIT_COSTS)) {
      expect(Number.isInteger(cost)).toBe(true);
      expect(cost).toBeGreaterThan(0);
    }
  });
});

describe("creditEntryTypeLabel", () => {
  it("returns a human label for every declared entry type", () => {
    for (const type of CREDIT_ENTRY_TYPE_VALUES) {
      const label = creditEntryTypeLabel(type);
      expect(label).not.toBe(type);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("falls back to echoing an unrecognized entry type rather than throwing", () => {
    expect(creditEntryTypeLabel("something_new")).toBe("something_new");
  });
});
