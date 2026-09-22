import type { ProductType } from "@/config/product-types";

export const DESIGN_COUNT_VALUES = [1, 5, 10, 20, 30] as const;

export const CONTENT_MODE_VALUES = ["text_only", "graphics_only", "text_and_graphics"] as const;
export type ContentMode = (typeof CONTENT_MODE_VALUES)[number];
export const contentModeOptions: { value: ContentMode; label: string }[] = [
  { value: "text_only", label: "Text only" },
  { value: "graphics_only", label: "Graphics only" },
  { value: "text_and_graphics", label: "Text + graphics" },
];

export const COLOR_MODE_VALUES = [
  "no_preference",
  "monochrome",
  "limited_palette",
  "full_color",
  "custom",
] as const;
export type ColorMode = (typeof COLOR_MODE_VALUES)[number];
export const colorModeOptions: { value: ColorMode; label: string }[] = [
  { value: "no_preference", label: "No preference" },
  { value: "monochrome", label: "Monochrome" },
  { value: "limited_palette", label: "Limited palette" },
  { value: "full_color", label: "Full color" },
  { value: "custom", label: "Custom colors" },
];

export const ORIENTATION_VALUES = ["square", "portrait", "landscape"] as const;
export type Orientation = (typeof ORIENTATION_VALUES)[number];
export const orientationOptions: { value: Orientation; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

export const DETAIL_LEVEL_VALUES = ["simple", "medium", "detailed"] as const;
export type DetailLevel = (typeof DETAIL_LEVEL_VALUES)[number];
export const detailLevelOptions: { value: DetailLevel; label: string; description: string }[] = [
  { value: "simple", label: "Simple", description: "Bold shapes, minimal detail — cleanest cutting paths." },
  { value: "medium", label: "Medium", description: "A balance of detail and cut-friendly simplicity." },
  { value: "detailed", label: "Detailed", description: "Rich detail — best for print, not ideal for cutting." },
];

export function labelFor(
  options: { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export type SmartDefaults = {
  requestedDesignCount: number;
  transparentBackground: boolean;
  orientation: Orientation;
  detailLevel: DetailLevel;
  /** true = the design-count step is locked to 1 and non-editable. */
  lockDesignCount: boolean;
};

/** Section 9: intelligent per-product-type defaults, applied when the type is first chosen. */
export function getSmartDefaults(productType: ProductType): SmartDefaults {
  switch (productType) {
    case "single_svg":
      return {
        requestedDesignCount: 1,
        transparentBackground: true,
        orientation: "square",
        detailLevel: "medium",
        lockDesignCount: true,
      };
    case "svg_bundle":
      return {
        requestedDesignCount: 10,
        transparentBackground: true,
        orientation: "square",
        detailLevel: "medium",
        lockDesignCount: false,
      };
    case "printable":
      return {
        requestedDesignCount: 5,
        transparentBackground: false,
        orientation: "portrait",
        detailLevel: "detailed",
        lockDesignCount: false,
      };
    case "coloring_pages":
      return {
        requestedDesignCount: 10,
        transparentBackground: false,
        orientation: "portrait",
        detailLevel: "medium",
        lockDesignCount: false,
      };
    default:
      return {
        requestedDesignCount: 10,
        transparentBackground: true,
        orientation: "square",
        detailLevel: "medium",
        lockDesignCount: false,
      };
  }
}
