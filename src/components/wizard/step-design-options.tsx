"use client";

import { SelectableCard } from "@/components/ui/selectable-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DESIGN_COUNT_VALUES,
  contentModeOptions,
  colorModeOptions,
  orientationOptions,
  detailLevelOptions,
  type ContentMode,
  type ColorMode,
  type Orientation,
  type DetailLevel,
} from "@/config/design-options";
import type { ProductType } from "@/config/product-types";

export function StepDesignOptions({
  productType,
  designCount,
  onDesignCountChange,
  contentMode,
  onContentModeChange,
  colorMode,
  onColorModeChange,
  customColors,
  onCustomColorsChange,
  transparentBackground,
  onTransparentBackgroundChange,
  orientation,
  onOrientationChange,
  detailLevel,
  onDetailLevelChange,
  errors,
}: {
  productType: ProductType;
  designCount: number;
  onDesignCountChange: (value: number) => void;
  contentMode: ContentMode;
  onContentModeChange: (value: ContentMode) => void;
  colorMode: ColorMode;
  onColorModeChange: (value: ColorMode) => void;
  customColors: string;
  onCustomColorsChange: (value: string) => void;
  transparentBackground: boolean;
  onTransparentBackgroundChange: (value: boolean) => void;
  orientation: Orientation;
  onOrientationChange: (value: Orientation) => void;
  detailLevel: DetailLevel;
  onDetailLevelChange: (value: DetailLevel) => void;
  errors?: { customColors?: string };
}) {
  const designCountLocked = productType === "single_svg";
  const isSvgOriented = productType === "svg_bundle" || productType === "single_svg";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Design options</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fine-tune what gets generated.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Number of designs</legend>
        {designCountLocked && (
          <p className="mt-1 text-xs text-muted-foreground">
            Single SVG always creates exactly 1 design.
          </p>
        )}
        <div className="mt-2 grid grid-cols-5 gap-2">
          {DESIGN_COUNT_VALUES.map((count) => (
            <button
              key={count}
              type="button"
              disabled={designCountLocked}
              aria-pressed={designCount === count}
              onClick={() => onDesignCountChange(count)}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                designCount === count
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border hover:bg-accent/40"
              }`}
            >
              {count}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Content mode</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {contentModeOptions.map((option) => (
            <SelectableCard
              key={option.value}
              type="radio"
              name="contentMode"
              label={option.label}
              selected={contentMode === option.value}
              onToggle={() => onContentModeChange(option.value)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Color preferences</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {colorModeOptions.map((option) => (
            <SelectableCard
              key={option.value}
              type="radio"
              name="colorMode"
              label={option.label}
              selected={colorMode === option.value}
              onToggle={() => onColorModeChange(option.value)}
            />
          ))}
        </div>
        {colorMode === "custom" && (
          <div className="mt-3 space-y-2">
            <Label htmlFor="wizard-custom-colors">Describe the colors</Label>
            <Input
              id="wizard-custom-colors"
              value={customColors}
              onChange={(e) => onCustomColorsChange(e.target.value)}
              placeholder="Sage green, terracotta, cream"
              aria-invalid={!!errors?.customColors}
              maxLength={200}
            />
            {errors?.customColors && (
              <p className="text-sm text-destructive">{errors.customColors}</p>
            )}
          </div>
        )}
      </fieldset>

      <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
        <div>
          <Label htmlFor="wizard-transparent-bg" className="text-sm font-medium">
            Transparent background
          </Label>
          <p className="text-xs text-muted-foreground">
            Recommended for cutting machines and layered designs.
          </p>
        </div>
        <Switch
          id="wizard-transparent-bg"
          checked={transparentBackground}
          onCheckedChange={onTransparentBackgroundChange}
          aria-label="Transparent background"
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Orientation</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {orientationOptions.map((option) => (
            <SelectableCard
              key={option.value}
              type="radio"
              name="orientation"
              label={option.label}
              selected={orientation === option.value}
              onToggle={() => onOrientationChange(option.value)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Detail level</legend>
        {isSvgOriented && (
          <p className="mt-1 text-xs text-muted-foreground">
            Simpler artwork produces cleaner cutting paths for Cricut and similar machines.
          </p>
        )}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {detailLevelOptions.map((option) => (
            <SelectableCard
              key={option.value}
              type="radio"
              name="detailLevel"
              label={option.label}
              description={option.description}
              selected={detailLevel === option.value}
              onToggle={() => onDetailLevelChange(option.value)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}
