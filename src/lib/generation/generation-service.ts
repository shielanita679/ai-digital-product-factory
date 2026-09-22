import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Project, Json } from "@/types/supabase";
import { generateDesignPrompts, type PromptEngineProjectInput } from "@/lib/ai/prompt-engine";
import { getImageProvider } from "@/lib/ai/provider-registry";
import {
  normalizeDimensions,
  type ImageGenerationProvider,
  type ImageGenerationResult,
  type NormalizedDimensions,
} from "@/lib/ai/image-provider";
import type { ProductType } from "@/config/product-types";
import type { ContentMode, ColorMode, Orientation } from "@/config/design-options";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { DesignStorage } from "@/lib/storage/design-storage";

/**
 * The generation pipeline's "future async boundary": every function here
 * takes an explicit `{ supabase, userId }` context instead of deriving it
 * from a request — it never calls `requireUser()`/`redirect()` itself.
 * That keeps this layer callable from anything with a Postgres/PostgREST
 * connection and an already-authenticated user id: today that's a Server
 * Action, but a future queue worker or provider webhook handler could
 * build the same context (with a service-role client standing in for the
 * user session) and call `startGenerationJob`/`retryDesign` unchanged.
 *
 * Phase 6 note on synchronous processing: job/design rows are persisted
 * *before* any provider call and updated incrementally as each design
 * resolves (not batched at the end), so a mid-batch crash leaves clearly
 * inspectable state — some designs 'completed', some still
 * 'pending'/'generating', the job stuck at 'processing' — rather than
 * silently losing everything. `findStaleProcessingJobs` below is a
 * foundation for a future recovery job to detect that state; no cron/
 * worker is introduced in Phase 6 itself (see the Phase 6 report for why:
 * a real queue is a meaningfully larger dependency that isn't justified
 * until a real provider's latency/batch-size profile requires it). For a
 * genuinely large real-provider batch that risks exceeding a serverless
 * function's execution limit, the concurrency-limited loop below is a
 * mitigation, not a guarantee — the documented next step is moving this
 * loop behind a queue/worker, consuming the same already-persisted rows.
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

const DEFAULT_GENERATION_CONCURRENCY = 2;
const MAX_GENERATION_CONCURRENCY = 5;

/** Server-only, configurable — never hammers a real provider by default. See AI_GENERATION_CONCURRENCY in .env.example. */
function getGenerationConcurrency(): number {
  const raw = process.env.AI_GENERATION_CONCURRENCY;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_GENERATION_CONCURRENCY;
  return Math.min(parsed, MAX_GENERATION_CONCURRENCY);
}

/** A small worker-pool limiter — no queue dependency needed for a bound this conservative. */
async function runWithConcurrencyLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = items[nextIndex++];
      await fn(current);
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

type DesignRow = { id: string; project_id: string; metadata: Json };

/**
 * Applies one provider result to its design row — shared by the batch
 * loop and retry, so both persist real assets identically. A `source:
 * "bytes"` success (a real provider) is uploaded to Storage; a `source:
 * "inline"` success (the mock) is stored exactly as Phase 5 did, no
 * Storage object involved. If the Storage upload itself fails after a
 * successful generation, the design is honestly marked failed — never
 * left "completed" with no retrievable image — so it surfaces for retry.
 */
async function applyGenerationResult(
  ctx: GenerationContext,
  design: DesignRow,
  result: ImageGenerationResult,
): Promise<"completed" | "failed"> {
  const baseMetadata = (design.metadata ?? {}) as Record<string, unknown>;

  if (!result.ok) {
    await ctx.supabase
      .from("designs")
      .update({
        status: "failed",
        error_message: result.errorMessage,
        metadata: { ...baseMetadata, providerMetadata: result.providerMetadata ?? null } as Json,
      })
      .eq("id", design.id);
    return "failed";
  }

  const sharedMetadata = {
    ...baseMetadata,
    mimeType: result.mimeType,
    transparentBackgroundApplied: result.transparentBackgroundApplied,
    providerMetadata: result.providerMetadata ?? null,
  };

  if (result.source === "inline") {
    await ctx.supabase
      .from("designs")
      .update({
        status: "completed",
        image_url: result.imageUrl,
        thumbnail_url: result.thumbnailUrl,
        width: result.width,
        height: result.height,
        provider_generation_id: result.providerGenerationId,
        metadata: sharedMetadata as Json,
      })
      .eq("id", design.id);
    return "completed";
  }

  try {
    const storage = new DesignStorage(ctx.supabase);
    const uploaded = await storage.upload({
      userId: ctx.userId,
      projectId: design.project_id,
      designId: design.id,
      bytes: result.imageBytes,
      mimeType: result.mimeType,
    });
    await ctx.supabase
      .from("designs")
      .update({
        status: "completed",
        storage_bucket: uploaded.bucket,
        storage_path: uploaded.path,
        file_size_bytes: uploaded.sizeBytes,
        width: result.width,
        height: result.height,
        provider_generation_id: result.providerGenerationId,
        metadata: sharedMetadata as Json,
      })
      .eq("id", design.id);
    return "completed";
  } catch {
    await ctx.supabase
      .from("designs")
      .update({
        status: "failed",
        error_message: "The image generated successfully but could not be saved to storage. You can retry this design.",
        metadata: { ...baseMetadata, providerMetadata: result.providerMetadata ?? null } as Json,
      })
      .eq("id", design.id);
    return "failed";
  }
}

export type StartGenerationOptions = {
  /** Test-only escape hatch (e.g. to inject failure simulation). Never set from the "Generate Designs" Server Action. */
  providerOverride?: ImageGenerationProvider;
};

/**
 * Load + verify ownership, validate config, build prompts, create the job
 * + pending design rows, run each design through the configured provider
 * (bounded concurrency), persist successful output (uploading to Storage
 * for a real provider), update rows as it goes, and finish by recomputing
 * the project's real design_count.
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

  // The real concurrency/idempotency guard is the partial unique index on
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
  const concurrency = getGenerationConcurrency();

  await runWithConcurrencyLimit(designRows, concurrency, async (design) => {
    const matchingPrompt = prompts.find((p) => p.variationIndex === design.variation_index);
    if (!matchingPrompt) return;

    await ctx.supabase.from("designs").update({ status: "generating" }).eq("id", design.id);

    const result = await provider.generate({
      variationIndex: matchingPrompt.variationIndex,
      title: matchingPrompt.title,
      prompt: matchingPrompt.prompt,
      negativePrompt: provider.capabilities.supportsNegativePrompt ? matchingPrompt.negativePrompt : null,
      dimensions: matchingPrompt.dimensions,
      transparentBackground: matchingPrompt.transparentBackground,
      seed: `${projectId}:${job.id}:${matchingPrompt.variationIndex}`,
    });

    const outcome = await applyGenerationResult(ctx, design, result);
    if (outcome === "completed") completedCount += 1;
    else failedCount += 1;

    // Each worker updates progress right after its own design resolves.
    // Under concurrency > 1 two updates can theoretically land out of
    // network order, but every write here carries the full up-to-date
    // snapshot (not an increment), and the definitive final counts are
    // written unconditionally once the whole batch settles below — so any
    // reordering only risks a momentary display flicker, never incorrect
    // final state.
    const progress = Math.round(((completedCount + failedCount) / designRows.length) * 100);
    await ctx.supabase
      .from("generation_jobs")
      .update({ completed_count: completedCount, failed_count: failedCount, progress })
      .eq("id", job.id);
  });

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
 * A real provider's successful retry overwrites the SAME Storage object
 * (upload uses `upsert: true` at the same, design-id-derived path) — no
 * duplicate design row, no duplicate Storage object.
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
    negativePrompt: provider.capabilities.supportsNegativePrompt ? design.negative_prompt : null,
    dimensions,
    transparentBackground: metadata.transparentBackgroundRequested ?? true,
    seed: `${design.project_id}:${design.generation_job_id}:${design.variation_index}:retry:${Date.now()}`,
  });

  await applyGenerationResult(ctx, design, result);

  await recomputeJobCounts(ctx.supabase, design.generation_job_id);
  await recomputeProjectDesignCount(ctx.supabase, design.project_id);
}

/**
 * Storage-first delete: if this design has a real stored asset, the
 * Storage object is removed BEFORE the database row. If that Storage
 * delete fails, we deliberately stop and leave the row intact rather than
 * deleting it anyway — a database row is the only thing that lets a
 * later attempt find and retry deleting the orphaned object; discarding
 * the row first and having storage cleanup fail silently would leave an
 * object nothing can ever clean up again.
 */
export async function deleteDesign(ctx: GenerationContext, designId: string): Promise<void> {
  const { data: design, error } = await ctx.supabase
    .from("designs")
    .select("project_id, storage_path")
    .eq("id", designId)
    .eq("user_id", ctx.userId)
    .single();

  if (error || !design) {
    throw new GenerationServiceError("Design not found.", "not_found");
  }

  if (design.storage_path) {
    const storage = new DesignStorage(ctx.supabase);
    const result = await storage.delete(design.storage_path);
    if (!result.ok) {
      throw new GenerationServiceError("Could not delete the stored image. Please try again.", "db_error");
    }
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

/**
 * Best-effort Storage cleanup for a project about to be deleted. The
 * database cascade (designs.project_id -> projects.id ON DELETE CASCADE)
 * removes the design ROWS automatically, but Storage objects are not part
 * of Postgres's cascade graph — this must run first, explicitly, from the
 * project-delete Server Action.
 *
 * Deliberately best-effort: a Storage failure here does not block the
 * project delete (the user asked to delete their project; blocking that
 * on an unrelated Storage hiccup would trap them with an undeletable
 * project). A failed object becomes an orphan nothing references any
 * longer — harmless dead data still governed by the same ownership-scoped
 * Storage RLS policy, not a security problem, safe to leave for manual/
 * administrative cleanup. True zero-orphan guarantees would need a real
 * distributed transaction across Postgres and Storage, which is out of
 * scope here.
 */
export async function cleanupProjectStorage(ctx: GenerationContext, projectId: string): Promise<void> {
  const { data: designs } = await ctx.supabase
    .from("designs")
    .select("storage_path")
    .eq("project_id", projectId)
    .eq("user_id", ctx.userId)
    .not("storage_path", "is", null);

  const paths = (designs ?? []).map((d) => d.storage_path).filter((p): p is string => !!p);
  if (paths.length === 0) return;

  const storage = new DesignStorage(ctx.supabase);
  await storage.deleteMany(paths);
}

/**
 * Foundation for future stale-job recovery — not wired into any cron or
 * route yet (see the module doc comment). A job stuck at
 * status='processing' with an `updated_at` far in the past almost
 * certainly means whatever process was handling it crashed or was killed
 * mid-batch, since every design update along the way bumps `updated_at`
 * via the existing trigger. A future recovery job/route can call this and
 * decide whether to mark those jobs 'failed' or attempt to resume them.
 */
export async function findStaleProcessingJobs(
  supabase: SupabaseClient<Database>,
  staleAfterMinutes = 15,
): Promise<Array<{ id: string; project_id: string; updated_at: string }>> {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60_000).toISOString();
  const { data } = await supabase
    .from("generation_jobs")
    .select("id, project_id, updated_at")
    .eq("status", "processing")
    .lt("updated_at", cutoff);
  return data ?? [];
}
