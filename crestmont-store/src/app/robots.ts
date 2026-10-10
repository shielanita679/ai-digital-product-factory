import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/config/business";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/cart", "/checkout", "/account", "/search"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
