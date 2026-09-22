import Link from "next/link";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 text-base font-semibold tracking-tight",
        className,
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-sm shadow-primary/30">
        <Sparkles className="size-4" />
      </span>
      <span>{siteConfig.shortName}</span>
    </Link>
  );
}
