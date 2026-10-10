import { collections } from "@/catalog/collections";
import { products } from "@/catalog/products";
import type { Collection, Product, ProductVariant } from "@/catalog/types";

/** Products visible on the storefront. */
export function getActiveProducts(): Product[] {
  return products.filter((p) => p.status === "active");
}

export function getProductBySlug(slug: string): Product | undefined {
  return getActiveProducts().find((p) => p.slug === slug);
}

export function getCollections(): Collection[] {
  return collections;
}

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((c) => c.slug === slug);
}

export function getProductsInCollection(slug: string): Product[] {
  return getActiveProducts().filter((p) => p.collection === slug);
}

export function getFeaturedProducts(limit = 8): Product[] {
  return getActiveProducts().filter((p) => p.merchandising?.featured).slice(0, limit);
}

export function getEssentialProducts(limit = 4): Product[] {
  return getActiveProducts().filter((p) => p.merchandising?.essentials).slice(0, limit);
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const same = getProductsInCollection(product.collection).filter((p) => p.id !== product.id);
  const others = getActiveProducts().filter((p) => p.collection !== product.collection);
  return [...same, ...others].slice(0, limit);
}

export type VariantLookup = { product: Product; variant: ProductVariant };

/** Resolves a SKU to its active product and variant. */
export function findVariantBySku(sku: string): VariantLookup | undefined {
  for (const product of getActiveProducts()) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (variant) return { product, variant };
  }
  return undefined;
}

export function isInStock(product: Product): boolean {
  return product.variants.some((v) => v.inventory > 0);
}

export function priceRange(product: Product): { min: number; max: number } {
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
  const scored = getActiveProducts().map((p) => {
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
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => priceRange(a).min - priceRange(b).min);
    case "price-desc":
      return copy.sort((a, b) => priceRange(b).min - priceRange(a).min);
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return copy;
  }
}
