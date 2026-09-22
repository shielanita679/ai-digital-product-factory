"use client";

import { SelectableCard } from "@/components/ui/selectable-card";
import { productTypeOptions, type ProductType } from "@/config/product-types";

export function StepProductType({
  value,
  onChange,
}: {
  value: ProductType;
  onChange: (value: ProductType) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">What kind of product is this?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          SVG Bundle and Single SVG are fully ready. Other types are marked
          Beta — you can plan them now, generation support is still rolling out.
        </p>
      </div>

      <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <legend className="sr-only">Product type</legend>
        {productTypeOptions.map((option) => (
          <SelectableCard
            key={option.value}
            type="radio"
            name="productType"
            label={option.label}
            description={option.description}
            icon={option.icon}
            badge={option.beta ? "Beta" : undefined}
            selected={value === option.value}
            onToggle={() => onChange(option.value)}
          />
        ))}
      </fieldset>
    </div>
  );
}
