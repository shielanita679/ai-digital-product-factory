export const JOB_STATUS_VALUES = [
  "queued",
  "processing",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUS_VALUES)[number];

export const jobStatusMeta: Record<
  JobStatus,
  { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }
> = {
  queued: { label: "Queued", badgeVariant: "outline" },
  processing: { label: "Generating", badgeVariant: "secondary" },
  completed: { label: "Complete", badgeVariant: "success" },
  partially_completed: { label: "Partially complete", badgeVariant: "accent" },
  failed: { label: "Failed", badgeVariant: "outline" },
  cancelled: { label: "Cancelled", badgeVariant: "outline" },
};

export function jobStatusLabel(status: string): string {
  return jobStatusMeta[status as JobStatus]?.label ?? status;
}

export const DESIGN_STATUS_VALUES = ["pending", "generating", "completed", "failed"] as const;
export type DesignStatus = (typeof DESIGN_STATUS_VALUES)[number];

export const designStatusMeta: Record<
  DesignStatus,
  { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }
> = {
  pending: { label: "Pending", badgeVariant: "outline" },
  generating: { label: "Generating", badgeVariant: "secondary" },
  completed: { label: "Completed", badgeVariant: "success" },
  failed: { label: "Failed", badgeVariant: "outline" },
};

export function designStatusLabel(status: string): string {
  return designStatusMeta[status as DesignStatus]?.label ?? status;
}

// Phase 7 — vectorization status (mirrors DESIGN_STATUS_VALUES's shape).
export const VECTORIZATION_STATUS_VALUES = ["queued", "processing", "completed", "failed"] as const;
export type VectorizationStatus = (typeof VECTORIZATION_STATUS_VALUES)[number];

export const vectorizationStatusMeta: Record<
  VectorizationStatus,
  { label: string; badgeVariant: "outline" | "secondary" | "accent" | "success" }
> = {
  queued: { label: "Queued", badgeVariant: "outline" },
  processing: { label: "Vectorizing…", badgeVariant: "secondary" },
  completed: { label: "Vector Ready", badgeVariant: "success" },
  failed: { label: "Vectorization Failed", badgeVariant: "outline" },
};

export function vectorizationStatusLabel(status: string): string {
  return vectorizationStatusMeta[status as VectorizationStatus]?.label ?? status;
}
