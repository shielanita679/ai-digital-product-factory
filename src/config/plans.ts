export type PlanId = "free" | "starter" | "creator" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  priceSuffix: string;
  description: string;
  credits: number;
  features: string[];
  cta: string;
  highlighted?: boolean;
  /**
   * Populated once the corresponding Stripe Price is created (Phase 11).
   * Kept here now so billing UI never hard-codes plan data.
   */
  stripePriceId?: string;
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
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = plans.find((p) => p.id === id);
  if (!plan) {
    throw new Error(`Unknown plan id: ${id}`);
  }
  return plan;
}
