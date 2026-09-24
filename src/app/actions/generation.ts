"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import {
  retryDesign,
  deleteDesign,
  GenerationServiceError,
} from "@/lib/generation/generation-service";
import { startGenerationJobWithCredits } from "@/lib/generation/generation-billing";
import { DesignStorage } from "@/lib/storage/design-storage";
import { startGenerationSchema, designIdSchema } from "@/lib/validations/generation";
import type { ActionResult } from "@/app/actions/projects";

function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

function revalidateGenerationPaths(projectId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/designs");
  if (projectId) revalidatePath(`/dashboard/products/${projectId}`);
}

export async function startGenerationAction(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  const parsed = startGenerationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };
  }

  const { supabase, user } = await requireUser();

  try {
    const result = await startGenerationJobWithCredits({ supabase, userId: user.id }, parsed.data.projectId);
    revalidateGenerationPaths(parsed.data.projectId);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof GenerationServiceError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not start generation. Please try again." };
  }
}

export async function retryDesignAction(input: unknown): Promise<ActionResult> {
  const parsed = designIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid design.") };
  }

  const { supabase, user } = await requireUser();

  try {
    await retryDesign({ supabase, userId: user.id }, parsed.data.id);
    revalidateGenerationPaths();
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof GenerationServiceError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not retry the design. Please try again." };
  }
}

/**
 * Real, stored designs only — a signed URL scoped to the requesting
 * user's own ownership-verified row, generated fresh on every call and
 * never persisted. Mock designs (no storage_path) are rejected here; the
 * UI never offers this action for them in the first place.
 */
export async function getDesignDownloadUrlAction(input: unknown): Promise<ActionResult<{ url: string; filename: string }>> {
  const parsed = designIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid design.") };
  }

  const { supabase, user } = await requireUser();

  const { data: design, error } = await supabase
    .from("designs")
    .select("id, storage_path, title")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .single();

  if (error || !design) {
    return { ok: false, error: "Design not found." };
  }
  if (!design.storage_path) {
    return { ok: false, error: "This is a mock development preview — there's no real file to download yet." };
  }

  const extension = design.storage_path.split(".").pop() || "png";
  const filename = `${design.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${extension}`;

  const storage = new DesignStorage(supabase);
  const url = await storage.createSignedUrl(design.storage_path, 300, filename);
  if (!url) {
    return { ok: false, error: "Could not prepare the download right now. Please try again." };
  }

  return { ok: true, data: { url, filename } };
}

export async function deleteDesignAction(input: unknown): Promise<ActionResult> {
  const parsed = designIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid design.") };
  }

  const { supabase, user } = await requireUser();

  try {
    await deleteDesign({ supabase, userId: user.id }, parsed.data.id);
    revalidateGenerationPaths();
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof GenerationServiceError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not delete the design. Please try again." };
  }
}
