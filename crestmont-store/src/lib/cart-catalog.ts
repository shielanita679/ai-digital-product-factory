import "server-only";

import { getPurchasableProducts, variantImage, variantLabel } from "@/lib/catalog";
import type { CartCatalog } from "@/lib/cart";

/** Builds the slim SKU map sent to the browser for cart rendering. Purchasable products only. */
export function buildCartCatalog(): CartCatalog {
  const catalog: CartCatalog = {};
  for (const product of getPurchasableProducts()) {
    for (const variant of product.variants) {
      const image = variantImage(product, variant);
      catalog[variant.sku] = {
        sku: variant.sku,
        productName: product.name,
        productSlug: product.slug,
        variantLabel: variantLabel(variant),
        priceCents: variant.priceCents,
        inventory: variant.inventory,
        image: { src: image.src, alt: image.alt },
      };
    }
  }
  return catalog;
}
