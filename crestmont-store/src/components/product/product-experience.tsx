"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Product, ProductVariant } from "@/catalog/types";
import { useCart } from "@/components/cart/cart-provider";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { commerce } from "@/config/commerce";

import { Price } from "./price";

function findVariant(product: Product, selection: Record<string, string>): ProductVariant | undefined {
  return product.variants.find((v) => product.options.every((o) => v.options[o.name] === selection[o.name]));
}

/**
 * Product gallery and purchase panel. The selected variant drives the
 * displayed image, price, availability and the SKU added to the cart.
 */
export function ProductExperience({
  product,
  initialSku,
  header,
  children,
}: {
  product: Product;
  initialSku: string;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { add, openDrawer } = useCart();
  const initial = product.variants.find((v) => v.sku === initialSku) ?? product.variants[0];
  const [selection, setSelection] = useState<Record<string, string>>(initial.options);
  const [imageIndex, setImageIndex] = useState(initial.imageIndex ?? 0);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<string | null>(null);

  const variant = findVariant(product, selection);
  const inStock = !!variant && variant.inventory > 0;
  const maxQty = variant ? Math.max(1, Math.min(commerce.maxQuantityPerLine, variant.inventory)) : 1;
  const qty = Math.min(quantity, maxQty);

  const choose = (option: string, value: string) => {
    const next = { ...selection, [option]: value };
    setSelection(next);
    const v = findVariant(product, next);
    if (v?.imageIndex !== undefined) setImageIndex(v.imageIndex);
    setStatus(null);
  };

  const valueAvailable = (option: string, value: string) =>
    product.variants.some((v) => v.options[option] === value && v.inventory > 0 && product.options.every((o) => o.name === option || v.options[o.name] === selection[o.name]));

  const addToCart = () => {
    if (!variant || !inStock) return;
    add(variant.sku, qty);
    setStatus(`Added ${qty} × ${product.name} to your cart.`);
    openDrawer();
  };

  const buyNow = () => {
    if (!variant || !inStock) return;
    add(variant.sku, qty);
    router.push("/checkout");
  };

  const image = product.images[imageIndex] ?? product.images[0];

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
      {/* Gallery */}
      <div className="lg:col-span-7">
        <div className="overflow-hidden bg-surface">
          <Image
            key={image.src}
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            preload
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="aspect-[4/5] h-auto w-full object-cover"
          />
        </div>
        {product.images.length > 1 && (
          <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5" aria-label="Product images">
            {product.images.map((img, i) => (
              <li key={img.src}>
                <button
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`Show image ${i + 1}: ${img.alt}`}
                  aria-current={i === imageIndex}
                  className={`block w-full overflow-hidden bg-surface outline-offset-2 ${i === imageIndex ? "ring-1 ring-ink" : "opacity-80 hover:opacity-100"}`}
                >
                  <Image src={img.src} alt="" width={240} height={300} loading="lazy" className="aspect-[4/5] h-auto w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Purchase panel */}
      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-28">
          {header}
          <p className="mt-4 text-xl">
            {variant ? <Price cents={variant.priceCents} compareAtCents={variant.compareAtPriceCents} /> : <span className="text-muted">Unavailable</span>}
          </p>
          <p className="mt-1 text-[0.8125rem] text-muted">Taxes and shipping calculated at checkout.</p>

          <div className="mt-8 grid gap-6">
            {product.options.map((option) => (
              <fieldset key={option.name}>
                <legend className="text-[0.8125rem] font-medium">
                  {option.name}: <span className="font-normal text-ink-2">{selection[option.name]}</span>
                </legend>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const selected = selection[option.name] === value;
                    const available = valueAvailable(option.name, value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => choose(option.name, value)}
                        aria-pressed={selected}
                        className={`min-h-10 border px-4 text-sm transition-colors ${selected ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink"} ${!available ? "text-muted line-through decoration-1" : ""} ${!available && selected ? "text-paper/70" : ""}`}
                      >
                        {value}
                        {!available && <span className="sr-only"> (out of stock)</span>}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <div>
              <p className="text-[0.8125rem] font-medium" id="qty-label">Quantity</p>
              <div className="mt-2.5 inline-flex items-center border border-line-strong" role="group" aria-labelledby="qty-label">
                <button type="button" className="grid size-11 place-items-center hover:bg-surface disabled:opacity-40" onClick={() => setQuantity(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
                  <MinusIcon size={14} />
                </button>
                <span className="w-10 text-center text-sm tabular-nums" aria-live="polite">{qty}</span>
                <button type="button" className="grid size-11 place-items-center hover:bg-surface disabled:opacity-40" onClick={() => setQuantity(Math.min(maxQty, qty + 1))} disabled={qty >= maxQty || !inStock} aria-label="Increase quantity">
                  <PlusIcon size={14} />
                </button>
              </div>
            </div>
          </div>

          <p className={`mt-6 text-[0.8125rem] ${inStock ? "text-success" : "text-danger"}`}>
            {inStock ? "In stock" : "Out of stock — this option is currently unavailable."}
          </p>

          <div className="mt-3 grid gap-2.5">
            <button type="button" onClick={addToCart} disabled={!inStock} className="btn-primary w-full">
              Add to cart
            </button>
            <button type="button" onClick={buyNow} disabled={!inStock} className="btn-secondary w-full">
              Buy now
            </button>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{status}</p>
          {variant && <p className="mt-3 text-xs text-muted">SKU: {variant.sku}</p>}

          {children}
        </div>
      </div>
    </div>
  );
}
