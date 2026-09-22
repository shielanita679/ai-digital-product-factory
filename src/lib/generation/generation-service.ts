import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Project, Json } from "@/types/supabase";
import { generateDesignPrompts, type PromptEngineProjectInput } from "@/lib/ai/prompt-engine";
import { getImageProvider } from "@/lib/ai/provider-registry";
import { normalizeDimensions, type ImageGenerationProvider, type NormalizedDimensions } from "@/lib/ai/image-provider";
import type { ProductType } from "@/config/product-types";
import type { ContentMode, ColorMode, Orientation } from "@/config/design-options";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";

/**
 * The generation pipeline's "future async boundary" (see AGENTS notes in
 * the Phase 5 report): every function here takes an explicit
 * `{ supabase, userId }` context instead of deriving it from a request —
 * it never calls `requireUser()`/`redirect()` itself. That keeps this
 * layer callable from anything with a Postgres/PostgREST connection and an
 * already-authenticated user id: today that's a Server Action, but a
 * Phase 6+ queue worker or provider webhook handler could build the same
 * context (with a service-role client standing in for the user session)
 * and call `startGenerationJob`/`retryDesign` unchanged. All processing
 * here is synchronous, which is acceptable for Phase 5's mock provider —
 * a real, slow provider would move the `for` loop below behind a queue,
 * with the job/design rows (already fully persisted, not in-memory state)
 * as the handoff point.
 */
export type GenerationContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type GenerationServiceErrorCode =
  | "not_found"
  | "invalid_config"
  | "job_already_active"
  | "migration_not_applied"
  | "provider_error"
  | "db_error";

export class GenerationServiceError extends Error {
  readonly code: GenerationServiceErrorCode;
  constructor(message: string, code: GenerationServiceErrorCode) {
    super(message);
    this.name = "GenerationServiceError";
    this.code = code;
  }
}

function toPromptEngineInput(project: Project): PromptEngineProjectInput {
  return {
    id: project.id,
    userPrompt: project.user_prompt ?? "",
    productType: project.product_type as ProductType,
    styles: project.style ?? [],
    customStyle: project.custom_style,
    targetAudience: project.target_audience ?? [],
    customAudience: project.custom_audience,
    requestedDesignCount: project.requested_design_count,
    contentMode: project.content_mode as ContentMode,
    colorMode: project.color_mode as ColorMode,
    customColors: project.custom_colors ?? [],
    transparentBackground: project.transparent_background,
    orientation: project.orientation as Orientation,
    detailLevel: project.detail_level,
  };
}

async function loadOwnedProject(ctx: GenerationContext, projectId: string): Promise<Project> {
  const { data, error } = await ctx.supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", ctx.userId)
    .single();

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      throw new GenerationServiceError(
        friendlyDbErrorMessage(error, "Could not load the product."),
        "migration_not_applied",
      );
    }
    throw new GenerationServiceError("Product not found.", "not_found");
  }
  if (!data) {
    throw new GenerationServiceError("Product not found.", "not_found");
  }
  return data;
}

function assertGenerationReady(project: Project): void {
  if (!project.user_prompt) {
    throw new GenerationServiceError(
      "This product hasn't completed the setup wizard yet, so there's nothing to generate from.",
      "invalid_config",
    );
  }
  if (!project.requested_design_count || project.requested_design_count < 1) {
    throw new GenerationServiceError(
      "This product doesn't have a valid number of designs configured.",
      "invalid_config",
    );
  }
}

function resolveProvider(providerOverride?: ImageGenerationProvider): ImageGenerationProvider {
  if (providerOverride) return providerOverride;
  try {
    return getImageProvider();
  } catch (err) {
    throw new GenerationServiceError(
      err instanceof Error ? err.message : "Unsupported image provider configured.",
      "provider_error",
    );
  }
}

export type StartGenerationOptions = {
  /** Test-only escape hatch (e.g. to inject failure simulation). Never set from the "Generate Designs" Server Action. */
  providerOverride?: ImageGenerationProvider;
};

/**
 * Steps 1-12 of the Phase 5 pipeline: authenticate (the caller already did
 * this — see the module doc comment), load + verify ownership, validate
 * config, build prompts, create the job + pending design rows, run each
 * design through the configured provider, update rows as it goes, and
 * finish by recomputing the project's real design_count.
 */
export async function startGenerationJob(
  ctx: GenerationContext,
  projectId: string,
  options: StartGenerationOptions = {},
): Promise<{ jobId: string }> {
  const project = await loadOwnedProject(ctx, projectId);
  assertGenerationReady(project);
  const provider = resolveProvider(options.providerOverride);
  const prompts = generateDesignPrompts(toPromptEngineInput(project));

  // The real concurrency guard is the partial unique index on
  // generation_jobs(project_id) WHERE status IN ('queued','processing') —
  // this insert either lands as the project's sole active job or fails
  // atomically with a unique-violation, so it's race-safe across
  // double-clicks, refreshes, and multiple tabs, not just a disabled button.
  const { data: job, error: jobError } = await ctx.supabase
    .from("generation_jobs")
    .insert({
      user_id: ctx.userId,
      project_id: projectId,
      status: "processing",
      provider: provider.name,
      requested_count: prompts.length,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (jobError || !job) {
    if (isMigrationNotAppliedError(jobError)) {
      throw new GenerationServiceError(
        friendlyDbErrorMessage(jobError, "Could not start generation."),
        "migration_not_applied",
      );
    }
    if (jobError?.code === "23505") {
      throw new GenerationServiceError(
        "A generation job is already running for this product. Wait for it to finish before starting another.",
        "job_already_active",
      );
    }
    throw new GenerationServiceError(friendlyDbErrorMessage(jobError, "Could not start generation."), "db_error");
  }

  const { data: designRows, error: designInsertError } = await ctx.supabase
    .from("designs")
    .insert(
      prompts.map((p) => ({
        user_id: ctx.userId,
        project_id: projectId,
        generation_job_id: job.id,
        variation_index: p.variationIndex,
        title: p.title,
        prompt: p.prompt,
        negative_prompt: p.negativePrompt,
        status: "pending",
        provider: provider.name,
        prompt_engine_version: p.promptEngineVersion,
        metadata: {
          dimensions: p.dimensions,
          transparentBackgroundRequested: p.transparentBackground,
        },
      })),
    )
    .select();

  if (designInsertError || !designRows) {
    throw new GenerationServiceError(
      friendlyDbErrorMessage(designInsertError, "Could not create design records."),
      isMigrationNotAppliedError(designInsertError) ? "migration_not_applied" : "db_error",
    );
  }

  let completedCount = 0;
  let failedCount = 0;

  for (const design of designRows) {
    const matchingPrompt = prompts.find((p) => p.variationIndex === design.variation_index);
    if (!matchingPrompt) continue;

    await ctx.supabase.from("designs").update({ status: "generating" }).eq("id", design.id);

    const result = await provider.generate({
      variationIndex: matchingPrompt.variationIndex,
      title: matchingPrompt.title,
      prompt: matchingPrompt.prompt,
      negativePrompt: provider.supportsNegativePrompt ? matchingPrompt.negativePrompt : null,
      dimensions: matchingPrompt.dimensions,
      transparentBackground: matchingPrompt.transparentBackground,
      seed: `${projectId}:${job.id}:${matchingPrompt.variationIndex}`,
    });

    if (result.ok) {
      completedCount += 1;
      await ctx.supabase
        .from("designs")
        .update({
          status: "completed",
          image_url: result.imageUrl,
          thumbnail_url: result.thumbnailUrl,
          width: result.width,
          height: result.height,
          provider_generation_id: result.providerGenerationId,
          metadata: {
            ...(design.metadata as Record<string, unknown>),
            mimeType: result.mimeType,
            transparentBackgroundApplied: result.transparentBackgroundApplied,
            providerMetadata: result.providerMetadata ?? null,
          } as Json,
        })
        .eq("id", design.id);
    } else {
      failedCount += 1;
      await ctx.supabase
        .from("designs")
        .update({
          status: "failed",
          error_message: result.errorMessage,
          metadata: {
            ...(design.metadata as Record<string, unknown>),
            providerMetadata: result.providerMetadata ?? null,
          } as Json,
        })
        .eq("id", design.id);
    }

    const progress = Math.round(((completedCount + failedCount) / designRows.length) * 100);
    await ctx.supabase
      .from("generation_jobs")
      .update({ completed_count: completedCount, failed_count: failedCount, progress })
      .eq("id", job.id);
  }

  const finalStatus =
    failedCount === 0 ? "completed" : completedCount === 0 ? "failed" : "partially_completed";

  await ctx.supabase
    .from("generation_jobs")
    .update({
      status: finalStatus,
      completed_count: completedCount,
      failed_count: failedCount,
      progress: 100,
      completed_at: new Date().toISOString(),
      error_message: finalStatus === "failed" ? "All designs failed to generate." : null,
    })
    .eq("id", job.id);

  await recomputeProjectDesignCount(ctx.supabase, projectId);

  return { jobId: job.id };
}

/**
 * The single source of truth for `projects.design_count`: a direct count
 * of this project's designs with status='completed'. Never derived from
 * requested_design_count and never incremented optimistically — a design
 * only counts once its row genuinely exists with status='completed'.
 */
export async function recomputeProjectDesignCount(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<void> {
  const { count } = await supabase
    .from("designs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "completed");

  await supabase
    .from("projects")
    .update({ design_count: count ?? 0 })
    .eq("id", projectId);
}

async function recomputeJobCounts(supabase: SupabaseClient<Database>, jobId: string): Promise<void> {
  const { data: designs } = await supabase.from("designs").select("status").eq("generation_job_id", jobId);
  if (!designs || designs.length === 0) return;

  const completedCount = designs.filter((d) => d.status === "completed").length;
  const failedCount = designs.filter((d) => d.status === "failed").length;
  const status = failedCount === 0 ? "completed" : completedCount === 0 ? "failed" : "partially_completed";

  await supabase
    .from("generation_jobs")
    .update({
      completed_count: completedCount,
      failed_count: failedCount,
      progress: Math.round(((completedCount + failedCount) / designs.length) * 100),
      status,
    })
    .eq("id", jobId);
}

export type RetryDesignOptions = {
  providerOverride?: ImageGenerationProvider;
};

/**
 * Clean, narrow retry: re-runs generation for exactly one previously
 * failed design, reusing its already-stored prompt/negative prompt/
 * dimensions (recomputing nothing) so retrying is reproducible and cheap.
 */
export async function retryDesign(
  ctx: GenerationContext,
  designId: string,
  options: RetryDesignOptions = {},
): Promise<void> {
  const { data: design, error } = await ctx.supabase
    .from("designs")
    .select("*")
    .eq("id", designId)
    .eq("user_id", ctx.userId)
    .single();

  if (error || !design) {
    throw new GenerationServiceError("Design not found.", "not_found");
  }
  if (design.status !== "failed") {
    throw new GenerationServiceError("Only failed designs can be retried.", "invalid_config");
  }

  const provider = resolveProvider(options.providerOverride);
  const metadata = (design.metadata ?? {}) as {
    dimensions?: NormalizedDimensions;
    transparentBackgroundRequested?: boolean;
  };
  const dimensions = metadata.dimensions ?? normalizeDimensions("square");

  await ctx.supabase.from("designs").update({ status: "generating", error_message: null }).eq("id", designId);

  const result = await provider.generate({
    variationIndex: design.variation_index,
    title: design.title,
    prompt: design.prompt,
    negativePrompt: provider.supportsNegativePrompt ? design.negative_prompt : null,
    dimensions,
    transparentBackground: metadata.transparentBackgroundRequested ?? true,
    seed: `${design.project_id}:${design.generation_job_id}:${design.variation_index}:retry:${Date.now()}`,
  });

  if (result.ok) {
    await ctx.supabase
      .from("designs")
      .update({
        status: "completed",
        image_url: result.imageUrl,
        thumbnail_url: result.thumbnailUrl,
        width: result.width,
        height: result.height,
        provider_generation_id: result.providerGenerationId,
        error_message: null,
        metadata: {
          ...metadata,
          mimeType: result.mimeType,
          transparentBackgroundApplied: result.transparentBackgroundApplied,
          providerMetadata: result.providerMetadata ?? null,
        } as Json,
      })
      .eq("id", designId);
  } else {
    await ctx.supabase
      .from("designs")
      .update({ status: "failed", error_message: result.errorMessage })
      .eq("id", designId);
  }

  await recomputeJobCounts(ctx.supabase, design.generation_job_id);
  await recomputeProjectDesignCount(ctx.supabase, design.project_id);
}

export async function deleteDesign(ctx: GenerationContext, designId: string): Promise<void> {
  const { data: design, error } = await ctx.supabase
    .from("designs")
    .select("project_id")
    .eq("id", designId)
    .eq("user_id", ctx.userId)
    .single();

  if (error || !design) {
    throw new GenerationServiceError("Design not found.", "not_found");
  }

  const { error: deleteError } = await ctx.supabase
    .from("designs")
    .delete()
    .eq("id", designId)
    .eq("user_id", ctx.userId);

  if (deleteError) {
    throw new GenerationServiceError(friendlyDbErrorMessage(deleteError, "Could not delete the design."), "db_error");
  }

  await recomputeProjectDesignCount(ctx.supabase, design.project_id);
}
