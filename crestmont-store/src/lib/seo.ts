import type { Metadata } from "next";

import { absoluteUrl, business } from "@/config/business";

/** Per-page metadata with canonical URL and matching OG/Twitter fields. */
export function pageMetadata({ title, description, path, image }: { title: string; description: string; path: string; image?: string }): Metadata {
  const url = absoluteUrl(path);
  const images = image ? [{ url: image }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: business.brandName, type: "website", images },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}
