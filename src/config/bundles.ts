import type { MockupTemplateType } from "@/lib/mockups/mockup-provider";

export const BUNDLE_STATUS_VALUES = ["draft", "building", "completed", "failed"] as const;
export type BundleStatus = (typeof BUNDLE_STATUS_VALUES)[number];

export const bundleStatusMeta: Record<
  BundleStatus,
  { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }
> = {
  draft: { label: "Draft", badgeVariant: "outline" },
  building: { label: "Building", badgeVariant: "secondary" },
  completed: { label: "Completed", badgeVariant: "success" },
  failed: { label: "Failed", badgeVariant: "outline" },
};

export function bundleStatusLabel(status: string): string {
  return bundleStatusMeta[status as BundleStatus]?.label ?? status;
}

export const MOCKUP_STATUS_VALUES = ["queued", "processing", "completed", "failed"] as const;
export type MockupStatus = (typeof MOCKUP_STATUS_VALUES)[number];

export const mockupStatusMeta: Record<
  MockupStatus,
  { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }
> = {
  queued: { label: "Queued", badgeVariant: "outline" },
  processing: { label: "Generating…", badgeVariant: "secondary" },
  completed: { label: "Ready", badgeVariant: "success" },
  failed: { label: "Failed", badgeVariant: "outline" },
};

export function mockupStatusLabel(status: string): string {
  return mockupStatusMeta[status as MockupStatus]?.label ?? status;
}

export const mockupTemplateOptions: { value: MockupTemplateType; label: string }[] = [
  { value: "tshirt", label: "T-Shirt" },
  { value: "mug", label: "Mug" },
  { value: "tote_bag", label: "Tote Bag" },
  { value: "wall_art", label: "Wall Art / Poster" },
  { value: "sticker_sheet", label: "Sticker Sheet" },
  { value: "digital_bundle_preview", label: "Digital Bundle Preview" },
];

export function mockupTemplateLabel(templateType: string): string {
  return mockupTemplateOptions.find((o) => o.value === templateType)?.label ?? templateType;
}
