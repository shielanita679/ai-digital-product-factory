/**
 * Centralized plan configuration — the single place plan/pricing data
 * lives, read by both the pre-Phase-11 marketing page (name/price/
 * features/cta) and Phase 11 billing (Stripe price resolution/monthly
 * credit grants). Nothing in a component, Server Action, or service
 * should hard-code a price display, a credit amount, or a Stripe env var
 * name directly; they import this config instead.
 *
 * Stripe Price IDs are deliberately NEVER hard-coded here — only the NAME
 * of the environment variable that holds one (see stripePriceEnvKey +
 * getStripePriceId below). This repo never invents/commits a production
 * Stripe Price ID; every environment supplies its own via .env.local.
 */
export type PlanId = "free" | "starter" | "creator" | "pro";
export const PLAN_VALUES: PlanId[] = ["free", "starter", "creator", "pro"];

/** Plans a seller can actually purchase through Checkout — excludes "free", which has no Stripe price. Must match subscriptions.plan_key's CHECK constraint in supabase/migrations. */
export const PURCHASABLE_PLAN_VALUES = ["starter", "creator", "pro"] as const;
export type PurchasablePlanId = (typeof PURCHASABLE_PLAN_VALUES)[number];

export function isPurchasablePlan(id: string): id is PurchasablePlanId {
  return (PURCHASABLE_PLAN_VALUES as readonly string[]).includes(id);
}

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  priceSuffix: string;
  description: string;
  /** Credits granted once per successfully paid billing period — 0 for the free plan (see FREE_SIGNUP_CREDITS in credits.ts for the one-time signup grant instead). */
  credits: number;
  features: string[];
  cta: string;
  highlighted?: boolean;
  /** Name of the env var holding this plan's Stripe test-mode Price ID — never the ID itself. Undefined for the free plan, which has no Stripe price. */
  stripePriceEnvKey?: string;
  active: boolean;
};

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceSuffix: "/month",
    description: "Test the platform with a handful of generations.",
    credits: 20,
    features: [
      "Limited generations",
      "Reduced generation limits",
      "Test the platform",
    ],
    cta: "Start for Free",
    active: true,
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    priceSuffix: "/month",
    description: "For sellers just getting started with digital products.",
    credits: 150,
    features: [
      "Increased generation credits",
      "PNG downloads",
      "SVG exports",
      "Basic mockups",
    ],
    cta: "Get Started",
    stripePriceEnvKey: "STRIPE_STARTER_PRICE_ID",
    active: true,
  },
  {
    id: "creator",
    name: "Creator",
    price: 49,
    priceSuffix: "/month",
    description: "For active sellers shipping bundles every week.",
    credits: 500,
    features: [
      "Larger monthly credit allowance",
      "Bundles",
      "Mockups",
      "Listing generator",
      "Commercial license",
      "ZIP export",
    ],
    cta: "Start Creating",
    highlighted: true,
    stripePriceEnvKey: "STRIPE_CREATOR_PRICE_ID",
    active: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    priceSuffix: "/month",
    description: "For power sellers and small studios at scale.",
    credits: 1500,
    features: [
      "Higher limits",
      "Bulk generation",
      "Premium mockups",
      "Priority processing",
      "Commercial usage",
    ],
    cta: "Go Pro",
    stripePriceEnvKey: "STRIPE_PRO_PRICE_ID",
    active: true,
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = plans.find((p) => p.id === id);
  if (!plan) {
    throw new Error(`Unknown plan id: ${id}`);
  }
  return plan;
}

export function planLabel(planId: string): string {
  return plans.find((p) => p.id === planId)?.name ?? planId;
}

/**
 * Resolves a plan's configured Stripe test-mode Price ID from the server
 * environment. Returns null when unset — callers (StripeService, the
 * billing page) must degrade gracefully rather than throw, per the Phase
 * 11 spec's "must degrade gracefully when Stripe prices are not
 * configured" requirement.
 */
export function getStripePriceId(planId: PurchasablePlanId): string | null {
  const cfg = getPlan(planId);
  if (!cfg.stripePriceEnvKey) return null;
  return process.env[cfg.stripePriceEnvKey]?.trim() || null;
}

export function getPlanIdForPriceId(priceId: string): PurchasablePlanId | null {
  for (const id of PURCHASABLE_PLAN_VALUES) {
    if (getStripePriceId(id) === priceId) return id;
  }
  return null;
}

export function getMonthlyCreditsForPriceId(priceId: string): number | null {
  const id = getPlanIdForPriceId(priceId);
  return id ? getPlan(id).credits : null;
}
