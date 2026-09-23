"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import {
  createBundle,
  renameBundle,
  setBundleItem,
  removeBundleItem,
  generateBundleCover,
  deleteBundle,
  BundleServiceError,
} from "@/lib/bundles/bundle-service";
import { createBundleSchema, bundleIdSchema, renameBundleSchema, setBundleItemSchema, removeBundleItemSchema } from "@/lib/validations/bundle";
import type { ActionResult } from "@/app/actions/projects";

function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

function revalidateBundlePaths(projectId?: string, bundleId?: string) {
  revalidatePath("/dashboard");
  if (projectId) revalidatePath(`/dashboard/products/${projectId}`);
  if (projectId && bundleId) revalidatePath(`/dashboard/products/${projectId}/bundles/${bundleId}`);
}

export async function createBundleAction(input: unknown): Promise<ActionResult<{ bundleId: string }>> {
  const parsed = createBundleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const result = await createBundle({ supabase, userId: user.id }, parsed.data.projectId, parsed.data.name);
    revalidateBundlePaths(parsed.data.projectId);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof BundleServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not create the bundle. Please try again." };
  }
}

export async function renameBundleAction(input: unknown): Promise<ActionResult> {
  const parsed = renameBundleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await renameBundle({ supabase, userId: user.id }, parsed.data.id, parsed.data.name);
    revalidateBundlePaths();
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof BundleServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not rename the bundle. Please try again." };
  }
}

export async function setBundleItemAction(input: unknown): Promise<ActionResult> {
  const parsed = setBundleItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await setBundleItem({ supabase, userId: user.id }, parsed.data.bundleId, parsed.data.designId, {
      includePng: parsed.data.includePng,
      includeSvg: parsed.data.includeSvg,
    });
    revalidateBundlePaths();
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof BundleServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not update the bundle selection. Please try again." };
  }
}

export async function removeBundleItemAction(input: unknown): Promise<ActionResult> {
  const parsed = removeBundleItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await removeBundleItem({ supabase, userId: user.id }, parsed.data.bundleId, parsed.data.designId);
    revalidateBundlePaths();
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof BundleServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not remove the design from the bundle. Please try again." };
  }
}

export async function generateBundleCoverAction(input: unknown): Promise<ActionResult> {
  const parsed = bundleIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await generateBundleCover({ supabase, userId: user.id }, parsed.data.id);
    revalidateBundlePaths();
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof BundleServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not generate the bundle cover. Please try again." };
  }
}

export async function deleteBundleAction(input: unknown): Promise<ActionResult> {
  const parsed = bundleIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await deleteBundle({ supabase, userId: user.id }, parsed.data.id);
    revalidateBundlePaths();
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof BundleServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not delete the bundle. Please try again." };
  }
}
