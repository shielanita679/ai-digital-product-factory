import Image from "next/image";
import Link from "next/link";

import type { Collection } from "@/catalog/types";

import { ArrowRightIcon } from "./icons";

/** Collection card. Uses collection photography when supplied, otherwise a typographic panel. */
export function CollectionTile({ collection, index, count, priority = false, large = false }: { collection: Collection; index: number; count: number; priority?: boolean; large?: boolean }) {
  return (
    <Link href={`/collections/${collection.slug}`} className="group block">
      {collection.image ? (
        <div className="overflow-hidden bg-surface">
          <Image
            src={collection.image.src}
            alt={collection.image.alt}
            width={collection.image.width}
            height={collection.image.height}
            preload={priority}
            sizes={large ? "(min-width: 640px) 50vw, 100vw" : "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"}
            className="aspect-[4/3] h-auto w-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.02]"
          />
        </div>
      ) : (
        <div className="flex aspect-[4/3] flex-col justify-between border border-line bg-surface p-5 transition-colors group-hover:border-line-strong sm:p-6">
          <span className="font-serif text-sm text-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>
          <span className={`font-serif leading-tight text-ink ${large ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{collection.name}</span>
        </div>
      )}
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h3 className={large ? "text-2xl sm:text-3xl" : "font-serif text-xl"}>{collection.name}</h3>
        <span className="shrink-0 text-[0.8125rem] text-muted">{count} {count === 1 ? "product" : "products"}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{collection.description}</p>
      {large && (
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm group-hover:underline group-hover:underline-offset-4">
          Shop {collection.name} <ArrowRightIcon size={16} />
        </span>
      )}
    </Link>
  );
}
