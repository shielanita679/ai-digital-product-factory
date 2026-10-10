export type ProductStatus = "active" | "draft" | "archived";

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
  /** Unique across the whole catalog. */
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
  /** Units on hand. 0 = out of stock. */
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
  /**
   * True for the demonstration catalog that ships with the codebase.
   * `npm run check:launch` fails while any active product is still a sample.
   */
  sample?: boolean;
  /** One sentence for cards, search results and meta descriptions. */
  summary: string;
  /** Product description, one paragraph per entry. */
  description: string[];
  features: string[];
  specifications: { label: string; value: string }[];
  included: string[];
  care?: string[];
  /** Product-specific shipping or handling note, shown beside the general shipping summary. */
  shippingNote?: string;
  /** Set false for final-sale items. */
  returnable: boolean;
  options: ProductOption[];
  variants: ProductVariant[];
  images: ProductImage[];
  /** Shipping weight per unit, packaged. */
  weight: Weight;
  /** Packaged dimensions. */
  dimensions: Dimensions;
  tags: string[];
  /** Merchandising placement only — not a claim about sales volume. */
  merchandising?: { featured?: boolean; essentials?: boolean };
};

export type Collection = {
  slug: string;
  name: string;
  description: string;
  image: ProductImage;
};
