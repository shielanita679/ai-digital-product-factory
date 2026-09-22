import type { LucideIcon } from "lucide-react";
import {
  Layers,
  Shapes,
  FileText,
  Sticker,
  Shirt,
  Palette,
  Image as ImageIcon,
  Scissors,
  FileStack,
  PenTool,
} from "lucide-react";

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

export const productTypeOptions: {
  value: ProductType;
  label: string;
  description: string;
  icon: LucideIcon;
  beta?: boolean;
}[] = [
  {
    value: "svg_bundle",
    label: "SVG Bundle",
    description: "A themed collection of cut-ready vector designs.",
    icon: Layers,
  },
  {
    value: "single_svg",
    label: "Single SVG",
    description: "One focused vector design.",
    icon: Shapes,
  },
  {
    value: "printable",
    label: "Printable",
    description: "Print-at-home pages like planners or wall art.",
    icon: FileText,
    beta: true,
  },
  {
    value: "sticker_pack",
    label: "Sticker Pack",
    description: "A set of standalone sticker designs.",
    icon: Sticker,
    beta: true,
  },
  {
    value: "tshirt_graphics",
    label: "T-Shirt Graphics",
    description: "Artwork sized for apparel printing.",
    icon: Shirt,
    beta: true,
  },
  {
    value: "sublimation",
    label: "Sublimation",
    description: "Full-bleed designs for sublimation printing.",
    icon: Palette,
    beta: true,
  },
  {
    value: "wall_art",
    label: "Wall Art",
    description: "Decorative prints for framing.",
    icon: ImageIcon,
    beta: true,
  },
  {
    value: "laser_cut",
    label: "Laser Cut",
    description: "Designs prepared for laser cutting machines.",
    icon: Scissors,
    beta: true,
  },
  {
    value: "digital_paper",
    label: "Digital Paper",
    description: "Repeating pattern backgrounds and textures.",
    icon: FileStack,
    beta: true,
  },
  {
    value: "coloring_pages",
    label: "Coloring Pages",
    description: "Line-art pages ready to color.",
    icon: PenTool,
    beta: true,
  },
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
