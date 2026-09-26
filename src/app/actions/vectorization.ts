"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import {
  vectorizeDesign,
  deleteVectorization,
  getVectorizationDownloadUrl,
  VectorizationServiceError,
} from "@/lib/vector/vectorize-service";
import { designIdSchema } from "@/lib/validations/generation";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit/rate-limiter";
import type { ActionResult } from "@/app/actions/projects";

function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

function revalidateVectorizationPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/designs");
  // Product detail pages are revalidated per-id by the caller when it
  // knows the id (mirrors generation.ts's revalidateGenerationPaths).
}

export async function vectorizeDesignAction(input: unknown): Promise<ActionResult<{ vectorizationId: string }>> {
  const parsed = designIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid design.") };
  }

  const { supabase, user } = await requireUser();

  try {
    await enforceRateLimit(user.id, "vectorization");
    const result = await vectorizeDesign({ supabase, userId: user.id }, parsed.data.id);
    revalidateVectorizationPaths();
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof VectorizationServiceError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not vectorize this design. Please try again." };
  }
}

export async function getVectorizationDownloadUrlAction(input: unknown): Promise<ActionResult<{ url: string; filename: string }>> {
  const parsed = designIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid design.") };
  }

  const { supabase, user } = await requireUser();

  try {
    const result = await getVectorizationDownloadUrl({ supabase, userId: user.id }, parsed.data.id);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof VectorizationServiceError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not prepare the download. Please try again." };
  }
}

export async function deleteVectorizationAction(input: unknown): Promise<ActionResult> {
  const parsed = designIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid design.") };
  }

  const { supabase, user } = await requireUser();

  try {
    await deleteVectorization({ supabase, userId: user.id }, parsed.data.id);
    revalidateVectorizationPaths();
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof VectorizationServiceError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not delete the vector. Please try again." };
  }
}
