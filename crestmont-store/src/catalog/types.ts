/**
 * Product lifecycle:
 *  - draft        not shown on the storefront at all
 *  - coming_soon  shown with its name, positioning and price, but cannot be ordered
 *  - active       purchasable — only if every required fact has been supplied
 *                 (see `activationIssues` in lib/catalog.ts); an incomplete
 *                 "active" product is treated as coming soon until fixed
 *  - archived     removed from the storefront, kept for records
 */
export type ProductStatus = "draft" | "coming_soon" | "active" | "archived";

export type ProductImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type ProductOption = {
  /** e.g. "Color", "Size" */
  name: string;
  values: string[];
};

export type ProductVariant = {
  /** Full SKU, unique across the catalog, beginning with the product's skuPrefix. */
  sku: string;
  /** One value per product option, keyed by option name. */
  options: Record<string, string>;
  priceCents: number;
  /**
   * A genuine previous selling price for this variant. Only set this if the
   * item was actually offered at that price for a meaningful period —
   * fabricated "was" prices are deceptive under FTC guidance.
   */
  compareAtPriceCents?: number;
  /** Verified units on hand. 0 = out of stock. */
  inventory: number;
  /** Index into product.images shown when this variant is selected. */
  imageIndex?: number;
};

export type Dimensions = { length: number; width: number; height: number; unit: "in" };
export type Weight = { value: number; unit: "oz" | "lb" };

export type Product = {
  id: string;
  slug: string;
  name: string;
  collection: string;
  status: ProductStatus;
  /** Internal SKU prefix; every variant SKU must start with it. */
  skuPrefix: string;
  /**
   * Selling price in cents. For pre-launch products this is the planned
   * price shown on the storefront; purchasable prices come from variants.
   */
  priceCents: number;
  /** One-sentence positioning, used on cards, search results and meta descriptions. */
  summary: string;

  // ---- Verified product facts. Leave undefined until supplied. ----
  /** Product description, one paragraph per entry. */
  description?: string[];
  features?: string[];
  specifications?: { label: string; value: string }[];
  included?: string[];
  care?: string[];
  /** Product-specific shipping or handling note. */
  shippingNote?: string;
  /** False for final-sale items. Undefined = not yet decided. */
  returnable?: boolean;
  options: ProductOption[];
  /** Empty until real SKUs and verified inventory exist. */
  variants: ProductVariant[];
  /** Real product photography only. */
  images: ProductImage[];
  /** Shipping weight per unit, packaged. */
  weight?: Weight;
  /** Packaged dimensions. */
  dimensions?: Dimensions;

  tags: string[];
  /**
   * Internal list of facts still to be supplied before this product can be
   * activated. Never shown to customers; reported by `npm run check:launch`.
   */
  pendingData: string[];
};

export type Collection = {
  slug: string;
  name: string;
  description: string;
  /** Optional collection photography. Collections render without it. */
  image?: ProductImage;
};
