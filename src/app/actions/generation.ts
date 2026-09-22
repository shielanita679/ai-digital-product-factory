"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import {
  startGenerationJob,
  retryDesign,
  deleteDesign,
  GenerationServiceError,
} from "@/lib/generation/generation-service";
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
    const result = await startGenerationJob({ supabase, userId: user.id }, parsed.data.projectId);
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
