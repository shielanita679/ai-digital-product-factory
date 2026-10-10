import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/config/business";
import { policies } from "@/config/policies";
import { getCollections, getVisibleProducts } from "@/lib/catalog";

const staticPaths = [
  "/", "/shop", "/collections", "/about", "/contact", "/faq", "/order-tracking",
  "/shipping-policy", "/return-policy", "/privacy-policy", "/terms-of-service", "/payment-policy", "/cookie-policy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const policyDate = policies.effectiveDate ? new Date(policies.effectiveDate) : undefined;
  return [
    ...staticPaths.map((p) => ({ url: absoluteUrl(p), lastModified: p.includes("policy") || p.includes("terms") ? policyDate : undefined })),
    ...getCollections().map((c) => ({ url: absoluteUrl(`/collections/${c.slug}`) })),
    ...getVisibleProducts().map((p) => ({
      url: absoluteUrl(`/products/${p.slug}`),
      ...(p.images.length ? { images: p.images.map((i) => absoluteUrl(i.src)) } : {}),
    })),
  ];
}
