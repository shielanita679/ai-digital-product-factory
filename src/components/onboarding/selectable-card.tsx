"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function SelectableCard({
  label,
  selected,
  onToggle,
  type,
  name,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
  type: "checkbox" | "radio";
  name?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-accent text-accent-foreground"
          : "border-border hover:bg-accent/40",
      )}
    >
      <span>{label}</span>
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
