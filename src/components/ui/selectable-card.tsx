"use client";

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function SelectableCard({
  label,
  description,
  icon: Icon,
  badge,
  selected,
  onToggle,
  type,
  name,
  className,
}: {
  label: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  selected: boolean;
  onToggle: () => void;
  type: "checkbox" | "radio";
  name?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-accent text-accent-foreground"
          : "border-border hover:bg-accent/40",
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
      )}

      <span className="flex-1">
        <span className="flex items-center gap-2">
          {label}
          {badge && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {badge}
            </Badge>
          )}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {description}
          </span>
        )}
      </span>

      <input
        type={type}
        name={name}
        checked={selected}
        onChange={onToggle}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center border text-primary-foreground",
          type === "checkbox" ? "rounded-md" : "rounded-full",
          selected ? "border-primary bg-primary" : "border-input bg-background",
        )}
      >
        {selected && <Check className="size-3.5" />}
      </span>
    </label>
  );
}
