export const PACKAGE_STATUS_VALUES = ["queued", "building", "completed", "failed"] as const;
export type PackageStatus = (typeof PACKAGE_STATUS_VALUES)[number];

export const packageStatusMeta: Record<
  PackageStatus,
  { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }
> = {
  queued: { label: "Not Built", badgeVariant: "outline" },
  building: { label: "Building…", badgeVariant: "secondary" },
  completed: { label: "Ready", badgeVariant: "success" },
  failed: { label: "Failed", badgeVariant: "outline" },
};

export function packageStatusLabel(status: string): string {
  return packageStatusMeta[status as PackageStatus]?.label ?? status;
}

/**
 * `status` reflects the LAST BUILD ATTEMPT only — it is deliberately NOT
 * the same signal as "is there a downloadable package right now". A
 * canonical package row keeps its last successful storage_path/checksum/
 * file_size_bytes across a FAILED rebuild (see PackageService.buildPackage's
 * doc comment), so `status === 'failed'` with a non-null storage_path means
 * "still downloadable, but the last rebuild attempt failed" — the UI must
 * check hasDownloadablePackage, not status alone, to decide whether to show
 * a Download button.
 */
export function hasDownloadablePackage(pkg: { storage_path: string | null } | null | undefined): boolean {
  return !!pkg?.storage_path;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} bytes`;
}
