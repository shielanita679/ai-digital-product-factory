import type { MetadataRoute } from "next";

import { absoluteUrl, business } from "@/config/business";
import { getActiveProducts, getCollections } from "@/lib/catalog";

const staticPaths = [
  "/", "/shop", "/collections", "/about", "/contact", "/faq", "/order-tracking",
  "/shipping-policy", "/return-policy", "/privacy-policy", "/terms-of-service", "/payment-policy", "/cookie-policy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const policyDate = new Date(business.policiesLastUpdated);
  return [
    ...staticPaths.map((p) => ({ url: absoluteUrl(p), lastModified: p.includes("policy") || p.includes("terms") ? policyDate : undefined })),
    ...getCollections().map((c) => ({ url: absoluteUrl(`/collections/${c.slug}`) })),
    ...getActiveProducts().map((p) => ({ url: absoluteUrl(`/products/${p.slug}`), images: p.images.map((i) => absoluteUrl(i.src)) })),
  ];
}
