import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Design, Json, Vectorization } from "@/types/supabase";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { DesignStorage } from "@/lib/storage/design-storage";
import { getVectorProvider } from "@/lib/vector/vector-provider-registry";
import { validateAndSanitizeSvg, type SvgRejectionCode } from "@/lib/vector/svg-validate";

/**
 * Mirrors GenerationContext in generation-service.ts: an explicit
 * `{ supabase, userId }` context rather than deriving identity from a
 * request, so this layer never calls requireUser()/redirect() itself and
 * stays callable from anything with an authenticated Supabase client.
 */
export type VectorizationContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type VectorizationServiceErrorCode =
  | "not_found"
  | "unsupported_design"
  | "missing_raster"
  | "already_active"
  | "already_completed"
  | "provider_error"
  | "invalid_svg"
  | "unsafe_svg"
  | "embedded_raster"
  | "too_complex"
  | "storage_error"
  | "db_error"
  | "migration_not_applied";

export class VectorizationServiceError extends Error {
  readonly code: VectorizationServiceErrorCode;
  constructor(message: string, code: VectorizationServiceErrorCode) {
    super(message);
    this.name = "VectorizationServiceError";
    this.code = code;
  }
}

/** Maps an SVG validation rejection onto the service's user-facing error taxonomy (section 23 of the Phase 7 spec) — never surfaces the raw internal code/message straight from svg-validate.ts. */
function mapSvgRejection(code: SvgRejectionCode): { code: VectorizationServiceErrorCode; message: string } {
  switch (code) {
    case "embedded_raster":
      return { code: "embedded_raster", message: "The vector result embeds raster image data instead of containing genuine vector geometry, so it was rejected." };
    case "too_complex":
      return { code: "too_complex", message: "The vector result is too complex (too many elements/paths) to store safely." };
    case "too_large":
    case "malformed_xml":
    case "invalid_root":
    case "missing_dimensions":
    case "zero_geometry":
      return { code: "invalid_svg", message: "The vector result was not a valid SVG, so it was rejected." };
    default:
      // Every remaining SvgThreatCode (script/handler/js-url/foreignObject/external-ref/css/xxe)
      return { code: "unsafe_svg", message: "The vector result contained unsafe content, so it was rejected." };
  }
}

function extractDesignMimeType(design: Design): string {
  const metadata = (design.metadata ?? {}) as { mimeType?: string };
  return metadata.mimeType || "image/png";
}

async function loadOwnedDesign(ctx: VectorizationContext, designId: string): Promise<Design> {
  const { data, error } = await ctx.supabase
    .from("designs")
    .select("*")
    .eq("id", designId)
    .eq("user_id", ctx.userId)
    .single();

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      throw new VectorizationServiceError(friendlyDbErrorMessage(error, "Could not load the design."), "migration_not_applied");
    }
    throw new VectorizationServiceError("Design not found.", "not_found");
  }
  if (!data) {
    throw new VectorizationServiceError("Design not found.", "not_found");
  }
  return data;
}

async function loadOwnedVectorization(ctx: VectorizationContext, designId: string): Promise<Vectorization | null> {
  const { data, error } = await ctx.supabase
    .from("vectorizations")
    .select("*")
    .eq("design_id", designId)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (error) {
    if (isMigrationNotAppliedError(error)) {
      throw new VectorizationServiceError(friendlyDbErrorMessage(error, "Could not load the vectorization."), "migration_not_applied");
    }
    throw new VectorizationServiceError(friendlyDbErrorMessage(error, "Could not load the vectorization."), "db_error");
  }
  return data;
}

async function markFailed(
  ctx: VectorizationContext,
  vectorizationId: string,
  errorMessage: string,
): Promise<void> {
  await ctx.supabase
    .from("vectorizations")
    .update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() })
    .eq("id", vectorizationId);
}

/**
 * Eligibility (section 15 of the Phase 7 spec): only a completed, REAL
 * stored raster design — `status === 'completed' && storage_path` set —
 * may be vectorized. A Phase 5 mock design's `image_url` is a
 * self-contained data: URI with no durable Storage object behind it, so
 * it is deliberately NOT treated as a production raster original here,
 * even though it superficially "has an image". Pending/generating/failed
 * designs are excluded by the same `status === 'completed'` check.
 */
function assertEligible(design: Design): void {
  if (design.status !== "completed" || !design.storage_path) {
    throw new VectorizationServiceError(
      "Only completed, real AI-generated designs can be vectorized. Mock development previews aren't eligible.",
      "unsupported_design",
    );
  }
}

export type VectorizeDesignOptions = {
  /** Test-only escape hatch. Never set from the Server Action path. */
  providerOverride?: ReturnType<typeof getVectorProvider>;
};

/**
 * Ownership verification -> raster retrieval -> provider call -> SVG
 * sanitize+validate -> metadata extraction -> Storage upload -> DB update
 * (section 14). One canonical row per design (`unique(design_id)` in the
 * migration): a first call inserts; a call after a prior 'failed' row
 * updates that same row in place (a real retry, not a new history entry)
 * so there is never an uncontrolled duplicate row or an orphaned prior
 * Storage object — the upload always lands at the same
 * `vector.svg` path via `upsert: true`. Calling this on an
 * already-'completed' or already-active design is rejected rather than
 * silently re-running, mirroring how "Regenerate" is disabled for a
 * completed image design elsewhere in the app.
 */
export async function vectorizeDesign(
  ctx: VectorizationContext,
  designId: string,
  options: VectorizeDesignOptions = {},
): Promise<{ vectorizationId: string }> {
  const design = await loadOwnedDesign(ctx, designId);
  assertEligible(design);

  const existing = await loadOwnedVectorization(ctx, designId);
  if (existing) {
    if (existing.status === "queued" || existing.status === "processing") {
      throw new VectorizationServiceError("This design is already being vectorized.", "already_active");
    }
    if (existing.status === "completed") {
      throw new VectorizationServiceError("This design already has a vector result.", "already_completed");
    }
    // status === "failed" — fall through and retry, reusing this row.
  }

  let provider;
  try {
    provider = options.providerOverride ?? getVectorProvider();
  } catch (err) {
    throw new VectorizationServiceError(err instanceof Error ? err.message : "Unsupported vector provider configured.", "provider_error");
  }

  const nowIso = new Date().toISOString();
  let vectorizationId: string;

  if (existing) {
    await ctx.supabase
      .from("vectorizations")
      .update({ status: "processing", provider: provider.name, error_message: null, started_at: nowIso, completed_at: null })
      .eq("id", existing.id);
    vectorizationId = existing.id;
  } else {
    const { data, error } = await ctx.supabase
      .from("vectorizations")
      .insert({
        user_id: ctx.userId,
        project_id: design.project_id,
        design_id: design.id,
        status: "processing",
        provider: provider.name,
        started_at: nowIso,
      })
      .select()
      .single();

    if (error || !data) {
      if (isMigrationNotAppliedError(error)) {
        throw new VectorizationServiceError(friendlyDbErrorMessage(error, "Could not start vectorization."), "migration_not_applied");
      }
      if (error?.code === "23505") {
        // Two concurrent first-time requests raced the unique(design_id)
        // constraint — the other one won, so this one is "already active"
        // from this caller's point of view, not a generic DB error.
        throw new VectorizationServiceError("This design is already being vectorized.", "already_active");
      }
      throw new VectorizationServiceError(friendlyDbErrorMessage(error, "Could not start vectorization."), "db_error");
    }
    vectorizationId = data.id;
  }

  let rasterBytes: Buffer;
  try {
    const storage = new DesignStorage(ctx.supabase);
    rasterBytes = await storage.download(design.storage_path as string);
  } catch {
    await markFailed(ctx, vectorizationId, "Could not read the stored image for this design.");
    throw new VectorizationServiceError("Could not read the stored image for this design.", "missing_raster");
  }

  const result = await provider.vectorize({
    designId: design.id,
    raster: {
      bytes: rasterBytes,
      mimeType: extractDesignMimeType(design),
      width: design.width ?? 0,
      height: design.height ?? 0,
    },
  });

  if (!result.ok) {
    await markFailed(ctx, vectorizationId, result.errorMessage);
    throw new VectorizationServiceError(result.errorMessage, "provider_error");
  }

  const validation = validateAndSanitizeSvg(result.svg);
  if (!validation.ok) {
    const mapped = mapSvgRejection(validation.code);
    await markFailed(ctx, vectorizationId, mapped.message);
    throw new VectorizationServiceError(mapped.message, mapped.code);
  }

  try {
    const storage = new DesignStorage(ctx.supabase);
    const uploaded = await storage.uploadVector({
      userId: ctx.userId,
      projectId: design.project_id,
      designId: design.id,
      svgBytes: Buffer.from(validation.svg, "utf8"),
    });

    const viewBox = validation.metadata.viewBox
      ? `${validation.metadata.viewBox.minX} ${validation.metadata.viewBox.minY} ${validation.metadata.viewBox.width} ${validation.metadata.viewBox.height}`
      : null;

    await ctx.supabase
      .from("vectorizations")
      .update({
        status: "completed",
        storage_bucket: uploaded.bucket,
        storage_path: uploaded.path,
        mime_type: "image/svg+xml",
        file_size_bytes: uploaded.sizeBytes,
        width: validation.metadata.width,
        height: validation.metadata.height,
        view_box: viewBox,
        path_count: validation.metadata.pathCount,
        shape_count: validation.metadata.shapeCount,
        color_count: validation.metadata.colorCount,
        has_embedded_raster: false,
        provider_vectorization_id: result.providerVectorizationId,
        settings: result.settingsApplied as Json,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", vectorizationId);
  } catch {
    await markFailed(ctx, vectorizationId, "The vector was created but could not be saved to storage. You can retry.");
    throw new VectorizationServiceError("The vector was created but could not be saved to storage. You can retry.", "storage_error");
  }

  return { vectorizationId };
}

/** Read-only, ownership-scoped fetch for one design — used by Server Actions and page resolvers. Returns null both when there is no row and when the migration hasn't been applied yet (see loadOwnedVectorization). */
export async function getVectorizationForDesign(ctx: VectorizationContext, designId: string): Promise<Vectorization | null> {
  try {
    return await loadOwnedVectorization(ctx, designId);
  } catch (err) {
    if (err instanceof VectorizationServiceError && err.code === "migration_not_applied") return null;
    throw err;
  }
}

/**
 * Bulk resolver for a page rendering many designs at once — mirrors
 * resolveDesignDisplayUrls's shape. Degrades to an empty map before the
 * Phase 7 migration is applied, so existing pages keep working unchanged.
 */
export async function resolveVectorizationsForDesigns(
  supabase: SupabaseClient<Database>,
  designIds: string[],
): Promise<Map<string, Vectorization>> {
  const result = new Map<string, Vectorization>();
  if (designIds.length === 0) return result;

  const { data, error } = await supabase.from("vectorizations").select("*").in("design_id", designIds);
  if (error || !data) return result;

  for (const row of data) {
    result.set(row.design_id, row);
  }
  return result;
}

/** Ownership-verified, short-lived signed download URL for a completed vector — never a persisted/permanent URL. */
export async function getVectorizationDownloadUrl(
  ctx: VectorizationContext,
  designId: string,
): Promise<{ url: string; filename: string }> {
  const design = await loadOwnedDesign(ctx, designId);
  const vectorization = await loadOwnedVectorization(ctx, designId);

  if (!vectorization || vectorization.status !== "completed" || !vectorization.storage_path) {
    throw new VectorizationServiceError("This design doesn't have a completed vector result yet.", "not_found");
  }

  const filename = `${design.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`;
  const storage = new DesignStorage(ctx.supabase);
  const url = await storage.createSignedUrl(vectorization.storage_path, 300, filename);
  if (!url) {
    throw new VectorizationServiceError("Could not prepare the download right now. Please try again.", "storage_error");
  }
  return { url, filename };
}

/**
 * Storage-first delete (mirrors deleteDesign in generation-service.ts):
 * the Storage object is removed before the database row, and the row is
 * deliberately kept if that Storage delete fails — see deleteDesign's own
 * doc comment for the full rationale. Exposed as an explicit action for a
 * "Remove vector" affordance, independent of deleting the whole design
 * (which also cleans up any vector derivative — see generation-service.ts).
 */
export async function deleteVectorization(ctx: VectorizationContext, designId: string): Promise<void> {
  const vectorization = await loadOwnedVectorization(ctx, designId);
  if (!vectorization) {
    throw new VectorizationServiceError("This design has no vector result to delete.", "not_found");
  }

  if (vectorization.storage_path) {
    const storage = new DesignStorage(ctx.supabase);
    const result = await storage.delete(vectorization.storage_path);
    if (!result.ok) {
      throw new VectorizationServiceError("Could not delete the stored vector. Please try again.", "storage_error");
    }
  }

  const { error } = await ctx.supabase.from("vectorizations").delete().eq("id", vectorization.id).eq("user_id", ctx.userId);
  if (error) {
    throw new VectorizationServiceError(friendlyDbErrorMessage(error, "Could not delete the vector."), "db_error");
  }
}
