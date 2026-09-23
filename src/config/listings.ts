/** Must match the `status` check constraint on product_listings in supabase/migrations. */
export const LISTING_STATUS_VALUES = ["draft", "generated", "edited", "completed", "failed"] as const;
export type ListingStatus = (typeof LISTING_STATUS_VALUES)[number];

export const listingStatusMeta: Record<
  ListingStatus,
  { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }
> = {
  draft: { label: "Draft", badgeVariant: "outline" },
  generated: { label: "Generated", badgeVariant: "success" },
  edited: { label: "Edited", badgeVariant: "secondary" },
  completed: { label: "Completed", badgeVariant: "success" },
  failed: { label: "Failed", badgeVariant: "outline" },
};

export function listingStatusLabel(status: string): string {
  return listingStatusMeta[status as ListingStatus]?.label ?? status;
}
