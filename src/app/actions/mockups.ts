"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import { generateMockups, deleteMockup, getMockupDownloadUrl, MockupServiceError } from "@/lib/bundles/mockup-service";
import { generateMockupsSchema, mockupIdSchema } from "@/lib/validations/bundle";
import type { ActionResult } from "@/app/actions/projects";

function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

function revalidateMockupPaths(projectId?: string, bundleId?: string) {
  revalidatePath("/dashboard");
  if (projectId) revalidatePath(`/dashboard/products/${projectId}`);
  if (projectId && bundleId) revalidatePath(`/dashboard/products/${projectId}/bundles/${bundleId}`);
}

export async function generateMockupsAction(
  input: unknown,
): Promise<ActionResult<{ results: Array<{ templateType: string; status: string; reason?: string }> }>> {
  const parsed = generateMockupsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const { results, projectId } = await generateMockups({ supabase, userId: user.id }, parsed.data.bundleId, parsed.data.designId, parsed.data.templateTypes);
    revalidateMockupPaths(projectId, parsed.data.bundleId);
    return { ok: true, data: { results } };
  } catch (err) {
    if (err instanceof MockupServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not generate mockups. Please try again." };
  }
}

export async function deleteMockupAction(input: unknown): Promise<ActionResult> {
  const parsed = mockupIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const { projectId, bundleId } = await deleteMockup({ supabase, userId: user.id }, parsed.data.id);
    revalidateMockupPaths(projectId, bundleId);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof MockupServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not delete the mockup. Please try again." };
  }
}

export async function getMockupDownloadUrlAction(input: unknown): Promise<ActionResult<{ url: string; filename: string }>> {
  const parsed = mockupIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const result = await getMockupDownloadUrl({ supabase, userId: user.id }, parsed.data.id);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof MockupServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not prepare the download. Please try again." };
  }
}
