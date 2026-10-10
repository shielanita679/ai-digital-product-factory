import { collections } from "@/catalog/collections";
import { products } from "@/catalog/products";
import type { Collection, Product, ProductVariant } from "@/catalog/types";

/**
 * Lists what prevents a product from being sold. An empty list means every
 * required, verified fact is present. Status is checked separately.
 */
export function activationIssues(product: Product): string[] {
  const issues: string[] = [];
  if (product.pendingData.length > 0) issues.push(`pending data: ${product.pendingData.join("; ")}`);
  if (product.variants.length === 0) issues.push("no variants with full SKUs");
  for (const v of product.variants) {
    if (!v.sku.startsWith(`${product.skuPrefix}-`)) issues.push(`SKU ${v.sku} does not start with ${product.skuPrefix}-`);
    if (!Number.isInteger(v.inventory) || v.inventory < 0) issues.push(`SKU ${v.sku} has invalid inventory`);
    if (!Number.isInteger(v.priceCents) || v.priceCents <= 0) issues.push(`SKU ${v.sku} has an invalid price`);
    for (const o of product.options) {
      if (!o.values.includes(v.options[o.name])) issues.push(`SKU ${v.sku} has no valid ${o.name}`);
    }
  }
  if (product.images.length === 0) issues.push("no product photography");
  if (!product.description?.length) issues.push("no description");
  if (!product.specifications?.length) issues.push("no specifications");
  if (!product.included?.length) issues.push("no list of what's included");
  if (!product.weight) issues.push("no shipping weight");
  if (!product.dimensions) issues.push("no package dimensions");
  if (product.returnable === undefined) issues.push("return eligibility not set");
  return issues;
}

/** Only active products with complete, verified data can be ordered. */
export function isPurchasable(product: Product): boolean {
  return product.status === "active" && activationIssues(product).length === 0;
}

/** Products shown on the storefront (purchasable or coming soon). */
export function getVisibleProducts(): Product[] {
  return products.filter((p) => p.status === "active" || p.status === "coming_soon");
}

export function getPurchasableProducts(): Product[] {
  return products.filter(isPurchasable);
}

export function getProductBySlug(slug: string): Product | undefined {
  return getVisibleProducts().find((p) => p.slug === slug);
}

export function getCollections(): Collection[] {
  return collections;
}

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((c) => c.slug === slug);
}

export function getProductsInCollection(slug: string): Product[] {
  return getVisibleProducts().filter((p) => p.collection === slug);
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const same = getProductsInCollection(product.collection).filter((p) => p.id !== product.id);
  const others = getVisibleProducts().filter((p) => p.collection !== product.collection);
  return [...same, ...others].slice(0, limit);
}

export type VariantLookup = { product: Product; variant: ProductVariant };

/** Resolves a SKU to a purchasable product and variant. */
export function findVariantBySku(sku: string): VariantLookup | undefined {
  for (const product of getPurchasableProducts()) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (variant) return { product, variant };
  }
  return undefined;
}

export function isInStock(product: Product): boolean {
  return isPurchasable(product) && product.variants.some((v) => v.inventory > 0);
}

export function priceRange(product: Product): { min: number; max: number } {
  if (product.variants.length === 0) return { min: product.priceCents, max: product.priceCents };
  const prices = product.variants.map((v) => v.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function variantLabel(variant: ProductVariant): string {
  return Object.values(variant.options).join(" / ");
}

export function variantImage(product: Product, variant: ProductVariant) {
  return product.images[variant.imageIndex ?? 0] ?? product.images[0];
}

export function defaultVariant(product: Product): ProductVariant {
  return product.variants.find((v) => v.inventory > 0) ?? product.variants[0];
}

/** Simple relevance search over name, summary, tags and collection. */
export function searchProducts(query: string): Product[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return [];
  const scored = getVisibleProducts().map((p) => {
    const collection = getCollectionBySlug(p.collection)?.name ?? "";
    const name = p.name.toLowerCase();
    const haystack = [p.summary, collection, ...p.tags, ...p.variants.map((v) => v.sku)].join(" ").toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (name.includes(t)) score += 3;
      else if (haystack.includes(t)) score += 1;
      else return { p, score: 0 };
    }
    return { p, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.p);
}

export type SortKey = "featured" | "price-asc" | "price-desc" | "name";

export function sortProducts(list: Product[], sort: SortKey): Product[] {
  const copy = [...list];
  // Price sorts only order purchasable products; pre-launch products keep
  // their catalog order at the end, so planned prices can't be inferred.
  const byPrice = (dir: 1 | -1) => {
    const priced = copy.filter(isPurchasable).sort((a, b) => dir * (priceRange(a).min - priceRange(b).min));
    return [...priced, ...copy.filter((p) => !isPurchasable(p))];
  };
  switch (sort) {
    case "price-asc":
      return byPrice(1);
    case "price-desc":
      return byPrice(-1);
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return copy;
  }
}
