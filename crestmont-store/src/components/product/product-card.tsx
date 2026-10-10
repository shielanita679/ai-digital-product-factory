import Image from "next/image";
import Link from "next/link";

import type { Product } from "@/catalog/types";
import { QuickAdd } from "@/components/cart/quick-add";
import { isInStock, isPurchasable, variantLabel } from "@/lib/catalog";

import { ImagePending } from "./image-pending";
import { ProductPrice } from "./price";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const image = product.images[0];
  const purchasable = isPurchasable(product);
  const inStock = isInStock(product);
  const colorCount = product.options.find((o) => o.name === "Color")?.values.length ?? 0;
  const badge = !purchasable ? "Coming soon" : !inStock ? "Out of stock" : null;

  return (
    <article className="group flex flex-col">
      <Link href={`/products/${product.slug}`} className="relative block overflow-hidden bg-surface">
        {image ? (
          <Image
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            preload={priority}
            loading={priority ? undefined : "lazy"}
            className="aspect-[4/5] h-auto w-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.02]"
          />
        ) : (
          <ImagePending name={product.name} />
        )}
        {badge && <span className="absolute top-3 right-3 bg-paper px-2 py-1 text-[0.6875rem] font-medium tracking-wide uppercase">{badge}</span>}
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        <h3 className="font-sans text-sm leading-snug font-medium">
          <Link href={`/products/${product.slug}`} className="hover:underline hover:underline-offset-4">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-ink-2">
          <ProductPrice product={product} />
        </p>
        {purchasable && colorCount > 1 && <p className="mt-0.5 text-[0.8125rem] text-muted">{colorCount} colors</p>}
        <div className="mt-auto pt-3">
          {purchasable ? (
            <QuickAdd
              productName={product.name}
              variants={product.variants.map((v) => ({ sku: v.sku, label: variantLabel(v) || product.name, inStock: v.inventory > 0 }))}
            />
          ) : (
            <Link href={`/products/${product.slug}`} className="btn-ghost min-h-10 w-full px-3 text-[0.8125rem]" aria-label={`View details for ${product.name}`}>
              View details
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Product[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
