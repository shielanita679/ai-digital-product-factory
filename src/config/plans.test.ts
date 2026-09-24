import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  plans,
  getPlan,
  planLabel,
  isPurchasablePlan,
  getStripePriceId,
  getPlanIdForPriceId,
  getMonthlyCreditsForPriceId,
  PURCHASABLE_PLAN_VALUES,
} from "@/config/plans";

const PRICE_ENV_KEYS = ["STRIPE_STARTER_PRICE_ID", "STRIPE_CREATOR_PRICE_ID", "STRIPE_PRO_PRICE_ID"];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of PRICE_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of PRICE_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("isPurchasablePlan", () => {
  it("accepts starter/creator/pro", () => {
    expect(isPurchasablePlan("starter")).toBe(true);
    expect(isPurchasablePlan("creator")).toBe(true);
    expect(isPurchasablePlan("pro")).toBe(true);
  });

  it("rejects free — it has no Stripe price and can't be checked out", () => {
    expect(isPurchasablePlan("free")).toBe(false);
  });

  it("rejects an unrecognized string", () => {
    expect(isPurchasablePlan("enterprise")).toBe(false);
  });
});

describe("getPlan", () => {
  it("returns the free plan with zero Stripe price env key", () => {
    const plan = getPlan("free");
    expect(plan.credits).toBe(20);
    expect(plan.stripePriceEnvKey).toBeUndefined();
  });

  it("throws for an unknown plan id rather than returning undefined silently", () => {
    // @ts-expect-error -- deliberately passing an invalid id to prove the runtime guard
    expect(() => getPlan("bogus")).toThrow(/Unknown plan id/);
  });
});

describe("planLabel", () => {
  it("returns the display name for a known plan", () => {
    expect(planLabel("creator")).toBe("Creator");
  });

  it("falls back to echoing the raw id for an unknown plan — never throws in display contexts", () => {
    expect(planLabel("nonexistent")).toBe("nonexistent");
  });
});

describe("getStripePriceId", () => {
  it("returns null when the plan's price env var is unset — never invents a production Price ID", () => {
    expect(getStripePriceId("starter")).toBeNull();
  });

  it("returns the configured price id, trimmed", () => {
    process.env.STRIPE_STARTER_PRICE_ID = "  price_test_starter  ";
    expect(getStripePriceId("starter")).toBe("price_test_starter");
  });

  it("treats an empty/whitespace-only env value as unconfigured", () => {
    process.env.STRIPE_STARTER_PRICE_ID = "   ";
    expect(getStripePriceId("starter")).toBeNull();
  });
});

describe("getPlanIdForPriceId / getMonthlyCreditsForPriceId", () => {
  it("resolves the plan id and credit amount for a configured price id", () => {
    process.env.STRIPE_CREATOR_PRICE_ID = "price_test_creator";
    expect(getPlanIdForPriceId("price_test_creator")).toBe("creator");
    expect(getMonthlyCreditsForPriceId("price_test_creator")).toBe(500);
  });

  it("returns null for a price id that matches no configured plan", () => {
    expect(getPlanIdForPriceId("price_unknown")).toBeNull();
    expect(getMonthlyCreditsForPriceId("price_unknown")).toBeNull();
  });
});

describe("plan catalog invariants", () => {
  it("every purchasable plan id has a corresponding entry in the plans array", () => {
    for (const id of PURCHASABLE_PLAN_VALUES) {
      expect(plans.some((p) => p.id === id)).toBe(true);
    }
  });

  it("every purchasable plan declares a stripePriceEnvKey; free does not", () => {
    for (const plan of plans) {
      if (plan.id === "free") expect(plan.stripePriceEnvKey).toBeUndefined();
      else expect(plan.stripePriceEnvKey).toBeTruthy();
    }
  });

  it("credit amounts strictly increase with price across the paid tiers", () => {
    const paid = plans.filter((p) => p.id !== "free").sort((a, b) => a.price - b.price);
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i].credits).toBeGreaterThan(paid[i - 1].credits);
    }
  });
});
