import Image from "next/image";
import Link from "next/link";

import type { Product } from "@/catalog/types";
import { QuickAdd } from "@/components/cart/quick-add";
import { isInStock, variantLabel } from "@/lib/catalog";

import { ProductPrice } from "./price";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const image = product.images[0];
  const inStock = isInStock(product);
  const colorCount = product.options.find((o) => o.name === "Color")?.values.length ?? 0;

  return (
    <article className="group flex flex-col">
      <Link href={`/products/${product.slug}`} className="relative block overflow-hidden bg-surface">
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
        {!inStock && <span className="absolute top-3 left-3 bg-paper px-2 py-1 text-[0.6875rem] font-medium tracking-wide uppercase">Out of stock</span>}
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
        {colorCount > 1 && <p className="mt-0.5 text-[0.8125rem] text-muted">{colorCount} colors</p>}
        <div className="mt-auto pt-3">
          <QuickAdd
            productName={product.name}
            variants={product.variants.map((v) => ({ sku: v.sku, label: variantLabel(v) || product.name, inStock: v.inventory > 0 }))}
          />
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
