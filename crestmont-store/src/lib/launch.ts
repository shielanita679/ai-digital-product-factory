import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { operations } from "@/config/operations";
import { policies } from "@/config/policies";
import { products } from "@/catalog/products";
import { activationIssues, getPurchasableProducts } from "@/lib/catalog";

/**
 * Lists every business term, credential, catalog item or infrastructure
 * decision that must be resolved before the store takes real orders. Used by
 * `npm run check:launch` and to gate checkout.
 */
export function getLaunchIssues(): string[] {
  const issues: string[] = [];
  const need = (value: unknown, message: string) => {
    if (value === null || value === undefined || value === "") issues.push(message);
  };

  // Domain & support
  need(process.env.NEXT_PUBLIC_SITE_URL, "Production domain: NEXT_PUBLIC_SITE_URL is not set.");
  if (!process.env.RESEND_API_KEY || !process.env.CONTACT_FROM_EMAIL) {
    issues.push("Contact-form delivery: RESEND_API_KEY and CONTACT_FROM_EMAIL are not both set (forms show as unavailable).");
  }

  // Payments / checkout
  issues.push(...getCheckoutBlockers());
  if (commerce.paymentsEnabled && !process.env.STRIPE_WEBHOOK_SECRET) {
    issues.push("STRIPE_WEBHOOK_SECRET is not set; paid orders will not be recorded by the webhook.");
  }
  if (process.env.STRIPE_AUTOMATIC_TAX !== "true") {
    issues.push("Sales tax setup not finalized (Stripe Tax is off; STRIPE_AUTOMATIC_TAX is not \"true\").");
  }

  // Fulfillment
  need(commerce.fulfillmentMethod, "Fulfillment method is not confirmed (config/commerce.ts).");
  need(commerce.carriers, "Shipping carriers are not confirmed (config/commerce.ts) — site refers to \"the shipping service\" until set.");
  if (commerce.international.enabled) {
    need(commerce.international.deliveryEstimate, "International delivery estimate is not set (config/commerce.ts).");
  }

  // Policies
  need(policies.effectiveDate, "Policy effective date is not set (config/policies.ts) — set it to the launch date.");

  // Infrastructure
  need(operations.hostingProvider, "Hosting provider is not selected (config/operations.ts).");
  if (!operations.orderDatabaseConfigured) {
    issues.push("Order & inventory database is not built (planned: a separate Crestmont Supabase project — see docs/ARCHITECTURE.md).");
  }
  if (operations.rateLimiter === "in_memory") {
    issues.push("Rate limiter is in-memory only and gives no distributed protection; replace before production (lib/rate-limit.ts).");
  }

  // Catalog
  for (const p of products) {
    if (p.status === "draft" || p.status === "archived") continue;
    const missing = activationIssues(p);
    if (p.status === "active" && missing.length > 0) {
      issues.push(`${p.name} is marked active but cannot be sold until fixed: ${missing.join("; ")}.`);
    } else if (p.status === "coming_soon") {
      issues.push(`${p.name} (${p.skuPrefix}) is coming soon. Needs: ${p.pendingData.join("; ") || missing.join("; ")}.`);
    }
  }

  const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
  const dupes = skus.filter((s, i) => skus.indexOf(s) !== i);
  if (dupes.length) issues.push(`Duplicate SKUs: ${[...new Set(dupes)].join(", ")}`);
  const prefixes = products.map((p) => p.skuPrefix);
  const dupePrefixes = prefixes.filter((s, i) => prefixes.indexOf(s) !== i);
  if (dupePrefixes.length) issues.push(`Duplicate SKU prefixes: ${[...new Set(dupePrefixes)].join(", ")}`);

  return issues;
}

/** Conditions that prevent creating a payment session at all. */
export function getCheckoutBlockers(): string[] {
  const issues: string[] = [];
  if (!commerce.paymentsEnabled) issues.push("Payments are disabled (commerce.paymentsEnabled = false in config/commerce.ts).");
  if (!process.env.STRIPE_SECRET_KEY || !commerce.paymentsEnabled) {
    issues.push("Crestmont's own Stripe account is not connected (STRIPE_SECRET_KEY for this store).");
  }
  if (commerce.shippingRates.length === 0) issues.push("No shipping rates are configured (config/commerce.ts).");
  if (!commerce.processingTime) issues.push("Order processing time is not set (config/commerce.ts).");
  if (!commerce.domesticDeliveryEstimate) issues.push("Domestic delivery estimate is not set (config/commerce.ts).");
  if (commerce.returns.windowDays === null) issues.push("Return window is not set (config/commerce.ts).");
  if (!business.supportEmail) issues.push("Support email: SUPPORT_EMAIL is not set.");
  if (getPurchasableProducts().length === 0) issues.push("No products are available for purchase yet (all are draft or coming soon).");
  return issues;
}

export function isCheckoutEnabled(): boolean {
  return getCheckoutBlockers().length === 0;
}
