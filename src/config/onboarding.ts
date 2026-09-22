export const SELLS_WHAT_VALUES = [
  "svg_designs",
  "cricut_designs",
  "print_on_demand",
  "printables",
  "stickers",
  "wall_art",
  "laser_cut_designs",
  "sublimation",
  "other",
] as const;

export const sellsWhatOptions: { value: (typeof SELLS_WHAT_VALUES)[number]; label: string }[] = [
  { value: "svg_designs", label: "SVG designs" },
  { value: "cricut_designs", label: "Cricut designs" },
  { value: "print_on_demand", label: "Print-on-demand" },
  { value: "printables", label: "Printables" },
  { value: "stickers", label: "Stickers" },
  { value: "wall_art", label: "Wall art" },
  { value: "laser_cut_designs", label: "Laser-cut designs" },
  { value: "sublimation", label: "Sublimation" },
  { value: "other", label: "Other" },
];

export const SELLS_WHERE_VALUES = [
  "etsy",
  "shopify",
  "own_website",
  "creative_marketplace",
  "social_media",
  "other",
] as const;

export const sellsWhereOptions: { value: (typeof SELLS_WHERE_VALUES)[number]; label: string }[] = [
  { value: "etsy", label: "Etsy" },
  { value: "shopify", label: "Shopify" },
  { value: "own_website", label: "Own website" },
  { value: "creative_marketplace", label: "Creative marketplace" },
  { value: "social_media", label: "Social media" },
  { value: "other", label: "Other" },
];

export const MONTHLY_VOLUME_VALUES = [
  "just_starting",
  "1_10",
  "11_50",
  "51_100",
  "100_plus",
] as const;

export const monthlyVolumeOptions: { value: (typeof MONTHLY_VOLUME_VALUES)[number]; label: string }[] = [
  { value: "just_starting", label: "Just starting" },
  { value: "1_10", label: "1–10" },
  { value: "11_50", label: "11–50" },
  { value: "51_100", label: "51–100" },
  { value: "100_plus", label: "100+" },
];

export function optionLabel(
  options: { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
