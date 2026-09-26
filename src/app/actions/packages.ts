"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import {
  buildPackage,
  deletePackage,
  getPackageDownloadUrl,
  checkPackagePrerequisites,
  PackageServiceError,
  type PrerequisiteCheck,
} from "@/lib/packages/package-service";
import { buildPackageSchema, packageIdSchema, checkPackagePrerequisitesSchema } from "@/lib/validations/package";
import { AnalyticsService } from "@/lib/analytics/analytics-service";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit/rate-limiter";
import type { ActionResult } from "@/app/actions/projects";

function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

function revalidatePackagePaths(projectId?: string, bundleId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/downloads");
  if (projectId) revalidatePath(`/dashboard/products/${projectId}`);
  if (projectId && bundleId) revalidatePath(`/dashboard/products/${projectId}/bundles/${bundleId}`);
}

export async function checkPackagePrerequisitesAction(input: unknown): Promise<ActionResult<PrerequisiteCheck>> {
  const parsed = checkPackagePrerequisitesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const result = await checkPackagePrerequisites({ supabase, userId: user.id }, parsed.data.bundleId, parsed.data.marketplace);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof PackageServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not check package prerequisites. Please try again." };
  }
}

export async function buildPackageAction(input: unknown): Promise<ActionResult<{ packageId: string }>> {
  const parsed = buildPackageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await enforceRateLimit(user.id, "package_generation");
    const { data: bundle } = await supabase.from("product_bundles").select("project_id").eq("id", parsed.data.bundleId).single();
    const result = await buildPackage({ supabase, userId: user.id }, parsed.data.bundleId, parsed.data.marketplace);
    void AnalyticsService.track({
      eventName: "package_created",
      userId: user.id,
      projectId: bundle?.project_id ?? null,
      metadata: { packageId: result.packageId, marketplace: parsed.data.marketplace },
    });
    revalidatePackagePaths(bundle?.project_id, parsed.data.bundleId);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    if (err instanceof PackageServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not build the package. Please try again." };
  }
}

export async function deletePackageAction(input: unknown): Promise<ActionResult> {
  const parsed = packageIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const { projectId, bundleId } = await deletePackage({ supabase, userId: user.id }, parsed.data.id);
    revalidatePackagePaths(projectId, bundleId);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof PackageServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not delete the package. Please try again." };
  }
}

export async function getPackageDownloadUrlAction(input: unknown): Promise<ActionResult<{ url: string; filename: string }>> {
  const parsed = packageIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const result = await getPackageDownloadUrl({ supabase, userId: user.id }, parsed.data.id);
    void AnalyticsService.track({ eventName: "package_downloaded", userId: user.id, metadata: { packageId: parsed.data.id } });
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof PackageServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not prepare the download. Please try again." };
  }
}
