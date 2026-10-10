import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { products } from "@/catalog/products";

/**
 * Lists every business term or setting that must be confirmed before the
 * store takes real orders. Used by `npm run check:launch` and to gate
 * checkout.
 */
export function getLaunchIssues(): string[] {
  const issues: string[] = [];
  const need = (value: unknown, message: string) => {
    if (value === null || value === undefined || value === "") issues.push(message);
  };

  need(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL is not set (domain, canonical URLs, support email).");
  need(business.supportResponseTime, "Support response time is not set (config/business.ts).");
  need(business.supportHours, "Support hours are not set (config/business.ts).");

  issues.push(...getCheckoutBlockers());
  need(commerce.carriers, "Shipping carriers are not set (config/commerce.ts).");
  need(commerce.shipsToPOBoxes, "P.O. box shipping decision is not set (config/commerce.ts).");
  need(commerce.orderChangeWindow, "Order change/cancellation window is not set (config/commerce.ts).");
  need(commerce.deliveryIssueReportWindow, "Window for reporting delivery issues is not set (config/commerce.ts).");
  need(commerce.returns.returnShippingPaidBy, "Return shipping responsibility is not set (config/commerce.ts).");
  need(commerce.returns.restockingFeePercent, "Restocking fee decision is not set (config/commerce.ts).");
  need(commerce.returns.refundProcessingDays, "Refund processing time is not set (config/commerce.ts).");
  if (commerce.international.enabled) {
    need(commerce.international.deliveryEstimate, "International delivery estimate is not set (config/commerce.ts).");
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) issues.push("STRIPE_WEBHOOK_SECRET is not set; paid orders will not be recorded by the webhook.");
  if (!process.env.RESEND_API_KEY && !process.env.CONTACT_WEBHOOK_URL) {
    issues.push("No contact-form delivery is configured (RESEND_API_KEY or CONTACT_WEBHOOK_URL).");
  }

  const samples = products.filter((p) => p.status === "active" && p.sample);
  if (samples.length > 0) {
    issues.push(`${samples.length} active product(s) are still sample catalog entries (catalog/products.ts).`);
  }
  const imagesArePlaceholders = products.some((p) => p.status === "active" && p.images.some((i) => i.src.endsWith(".svg")));
  if (imagesArePlaceholders) issues.push("Product images are still placeholder artwork; replace with product photography.");

  const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
  const dupes = skus.filter((s, i) => skus.indexOf(s) !== i);
  if (dupes.length) issues.push(`Duplicate SKUs: ${[...new Set(dupes)].join(", ")}`);

  return issues;
}

/** Conditions that prevent creating a payment session at all. */
export function getCheckoutBlockers(): string[] {
  const issues: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) issues.push("STRIPE_SECRET_KEY is not set.");
  if (commerce.shippingRates.length === 0) issues.push("No shipping rates are configured (config/commerce.ts).");
  if (!commerce.processingTime) issues.push("Order processing time is not set (config/commerce.ts).");
  if (!commerce.domesticDeliveryEstimate) issues.push("Domestic delivery estimate is not set (config/commerce.ts).");
  if (commerce.returns.windowDays === null) issues.push("Return window is not set (config/commerce.ts).");
  if (!business.supportEmail) issues.push("Support email is not set.");
  return issues;
}

export function isCheckoutEnabled(): boolean {
  return getCheckoutBlockers().length === 0;
}
