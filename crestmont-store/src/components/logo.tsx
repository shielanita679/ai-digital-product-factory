import Link from "next/link";

import { business } from "@/config/business";

/** Text wordmark. The legal name lives in business config; this is the brand mark. */
export function Logo({ className = "" }: { className?: string }) {
  const [first, ...rest] = business.brandName.split(" ");
  return (
    <Link href="/" className={`inline-flex items-baseline gap-2 leading-none ${className}`} aria-label={`${business.brandName} home`}>
      <span className="font-serif text-[1.375rem] tracking-[0.14em] text-ink sm:text-2xl">{first}</span>
      {rest.length > 0 && <span className="hidden text-[0.625rem] font-medium tracking-[0.32em] text-muted sm:inline">{rest.join(" ")}</span>}
    </Link>
  );
}
