/**
 * Shown in place of product photography until real photos are supplied.
 * Deliberately plain: it names the product rather than depicting it, so
 * nothing on the page can misrepresent what a customer would receive.
 */
export function ImagePending({ name, collection, size = "card" }: { name: string; collection?: string; size?: "card" | "large" | "thumb" }) {
  return (
    <div
      role="img"
      aria-label={`Photography for ${name} coming soon`}
      className="flex aspect-[4/5] w-full flex-col justify-between bg-surface p-4 text-ink-2 sm:p-5"
      style={{ backgroundImage: "linear-gradient(180deg, var(--color-surface) 0%, var(--color-surface-2) 100%)" }}
    >
      {size !== "thumb" && collection && <span className="eyebrow">{collection}</span>}
      <span className={size === "large" ? "font-serif text-3xl leading-tight text-ink sm:text-4xl" : size === "thumb" ? "sr-only" : "font-serif text-lg leading-snug text-ink"}>
        {name.replace(/^Crestmont\s+/, "")}
      </span>
      {size !== "thumb" && <span className="text-[0.75rem] text-muted">Photography coming soon</span>}
    </div>
  );
}
