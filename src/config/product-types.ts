/** Must match the `product_type` check constraint in supabase/migrations. */
export const PRODUCT_TYPE_VALUES = [
  "svg_bundle",
  "single_svg",
  "printable",
  "sticker_pack",
  "tshirt_graphics",
  "sublimation",
  "wall_art",
  "laser_cut",
  "digital_paper",
  "coloring_pages",
] as const;

export type ProductType = (typeof PRODUCT_TYPE_VALUES)[number];

export const productTypeOptions: { value: ProductType; label: string; beta?: boolean }[] = [
  { value: "svg_bundle", label: "SVG Bundle" },
  { value: "single_svg", label: "Single SVG" },
  { value: "printable", label: "Printable", beta: true },
  { value: "sticker_pack", label: "Sticker Pack", beta: true },
  { value: "tshirt_graphics", label: "T-Shirt Graphics", beta: true },
  { value: "sublimation", label: "Sublimation", beta: true },
  { value: "wall_art", label: "Wall Art", beta: true },
  { value: "laser_cut", label: "Laser Cut", beta: true },
  { value: "digital_paper", label: "Digital Paper", beta: true },
  { value: "coloring_pages", label: "Coloring Pages", beta: true },
];

export function productTypeLabel(value: string): string {
  return productTypeOptions.find((o) => o.value === value)?.label ?? value;
}

/** Must match the `status` check constraint in supabase/migrations. */
export const PROJECT_STATUS_VALUES = ["draft", "in_progress", "ready", "published"] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

export const projectStatusMeta: Record<ProjectStatus, { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }> = {
  draft: { label: "Draft", badgeVariant: "outline" },
  in_progress: { label: "In Progress", badgeVariant: "secondary" },
  ready: { label: "Ready", badgeVariant: "accent" },
  published: { label: "Published", badgeVariant: "success" },
};

export function projectStatusLabel(status: string): string {
  return projectStatusMeta[status as ProjectStatus]?.label ?? status;
}
