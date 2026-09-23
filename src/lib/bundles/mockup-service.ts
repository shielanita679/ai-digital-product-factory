import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Mockup, Json } from "@/types/supabase";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { MockupStorage } from "@/lib/storage/mockup-storage";
import { getMockupProvider } from "@/lib/mockups/mockup-provider-registry";
import { sniffImageMimeType } from "@/lib/ai/provider-http";
import type { MockupProvider, MockupTemplateType } from "@/lib/mockups/mockup-provider";
import { recomputeBundleMockupCount } from "@/lib/bundles/bundle-service";

export type MockupContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type MockupServiceErrorCode =
  | "not_found"
  | "unsupported_design"
  | "invalid_config"
  | "already_active"
  | "provider_error"
  | "invalid_image"
  | "storage_error"
  | "db_error"
  | "migration_not_applied";

export class MockupServiceError extends Error {
  readonly code: MockupServiceErrorCode;
  constructor(message: string, code: MockupServiceErrorCode) {
    super(message);
    this.name = "MockupServiceError";
    this.code = code;
  }
}

const DEFAULT_MOCKUP_CONCURRENCY = 2;
const MAX_MOCKUP_CONCURRENCY = 5;

function getMockupConcurrency(): number {
  const raw = process.env.MOCKUP_GENERATION_CONCURRENCY;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MOCKUP_CONCURRENCY;
  return Math.min(parsed, MAX_MOCKUP_CONCURRENCY);
}

/** Small worker-pool limiter — duplicated from generation-service.ts's private runWithConcurrencyLimit rather than shared, keeping the two generation pipelines independent (same reasoning as the duplicated hashString across mock providers). */
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

async function loadOwnedBundleAndDesign(ctx: MockupContext, bundleId: string, designId: string) {
  const { data: bundle, error: bundleError } = await ctx.supabase.from("product_bundles").select("*").eq("id", bundleId).eq("user_id", ctx.userId).single();
  if (bundleError || !bundle) {
    if (isMigrationNotAppliedError(bundleError)) {
      throw new MockupServiceError(friendlyDbErrorMessage(bundleError, "Could not load the bundle."), "migration_not_applied");
    }
    throw new MockupServiceError("Bundle not found.", "not_found");
  }

  const { data: design, error: designError } = await ctx.supabase.from("designs").select("*").eq("id", designId).eq("user_id", ctx.userId).single();
  if (designError || !design) throw new MockupServiceError("Design not found.", "not_found");

  if (design.status !== "completed" || !design.storage_path) {
    throw new MockupServiceError("Only completed, real AI-generated designs can have mockups generated.", "unsupported_design");
  }
  if (design.project_id !== bundle.project_id) {
    throw new MockupServiceError("This design doesn't belong to the bundle's product.", "invalid_config");
  }

  return { bundle, design };
}

async function markFailed(ctx: MockupContext, mockupId: string, errorMessage: string): Promise<void> {
  await ctx.supabase.from("mockups").update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() }).eq("id", mockupId);
}

async function upsertQueuedRow(ctx: MockupContext, bundle: { id: string; project_id: string }, designId: string, templateType: MockupTemplateType, provider: MockupProvider): Promise<string> {
  const { data: existing } = await ctx.supabase
    .from("mockups")
    .select("*")
    .eq("bundle_id", bundle.id)
    .eq("design_id", designId)
    .eq("template_type", templateType)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "queued" || existing.status === "processing") {
      throw new MockupServiceError(`A ${templateType} mockup for this design is already being generated.`, "already_active");
    }
    await ctx.supabase
      .from("mockups")
      .update({ status: "processing", provider: provider.name, error_message: null, started_at: new Date().toISOString(), completed_at: null })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await ctx.supabase
    .from("mockups")
    .insert({
      bundle_id: bundle.id,
      design_id: designId,
      user_id: ctx.userId,
      project_id: bundle.project_id,
      template_type: templateType,
      status: "processing",
      provider: provider.name,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    if (isMigrationNotAppliedError(error)) {
      throw new MockupServiceError(friendlyDbErrorMessage(error, "Could not start mockup generation."), "migration_not_applied");
    }
    if (error?.code === "23505") {
      throw new MockupServiceError(`A ${templateType} mockup for this design is already being generated.`, "already_active");
    }
    throw new MockupServiceError(friendlyDbErrorMessage(error, "Could not start mockup generation."), "db_error");
  }
  return data.id;
}

async function generateOneMockup(ctx: MockupContext, bundle: { id: string; project_id: string }, design: { id: string; title: string; metadata: unknown }, templateType: MockupTemplateType, provider: MockupProvider): Promise<"completed" | "failed"> {
  let mockupId: string;
  try {
    mockupId = await upsertQueuedRow(ctx, bundle, design.id, templateType, provider);
  } catch (err) {
    // already_active / migration_not_applied — nothing to mark failed, this call never created/updated a row.
    throw err;
  }

  const sourceMeta = (design.metadata ?? {}) as { mimeType?: string; dimensions?: { width?: number; height?: number } };

  const result = await provider.generate({
    designId: design.id,
    bundleId: bundle.id,
    templateType,
    designTitle: design.title,
    sourceRaster: {
      mimeType: sourceMeta.mimeType || "image/png",
      width: sourceMeta.dimensions?.width ?? 1024,
      height: sourceMeta.dimensions?.height ?? 1024,
    },
  });

  if (!result.ok) {
    await markFailed(ctx, mockupId, result.errorMessage);
    return "failed";
  }

  const sniffed = sniffImageMimeType(result.bytes);
  if (!sniffed || sniffed !== result.mimeType) {
    await markFailed(ctx, mockupId, "The mockup provider returned an image that failed validation.");
    return "failed";
  }

  try {
    const storage = new MockupStorage(ctx.supabase);
    const uploaded = await storage.uploadMockup({ userId: ctx.userId, projectId: bundle.project_id, bundleId: bundle.id, mockupId, bytes: result.bytes });
    await ctx.supabase
      .from("mockups")
      .update({
        status: "completed",
        storage_bucket: uploaded.bucket,
        storage_path: uploaded.path,
        mime_type: result.mimeType,
        width: result.width,
        height: result.height,
        file_size_bytes: uploaded.sizeBytes,
        provider_mockup_id: result.providerMockupId,
        metadata: (result.metadata ?? {}) as Json,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", mockupId);
    return "completed";
  } catch {
    await markFailed(ctx, mockupId, "The mockup was generated but could not be saved to storage. You can retry.");
    return "failed";
  }
}

/**
 * Generates (or retries) mockups for one design across a batch of
 * templates. Concurrency-limited (mirrors startGenerationJob's worker
 * pool in generation-service.ts) even though the mock provider is fast
 * and local — keeping the same architecture a real, rate-limited
 * provider will need later. One failed template never corrupts another:
 * each template's row/upload/failure is fully independent, and the
 * caller gets a per-template outcome back rather than an all-or-nothing
 * result.
 */
export async function generateMockups(
  ctx: MockupContext,
  bundleId: string,
  designId: string,
  templateTypes: MockupTemplateType[],
  options: { providerOverride?: MockupProvider } = {},
): Promise<{ results: Array<{ templateType: MockupTemplateType; status: "completed" | "failed" | "skipped"; reason?: string }>; projectId: string }> {
  const { bundle, design } = await loadOwnedBundleAndDesign(ctx, bundleId, designId);

  let provider: MockupProvider;
  try {
    provider = options.providerOverride ?? getMockupProvider();
  } catch (err) {
    throw new MockupServiceError(err instanceof Error ? err.message : "Unsupported mockup provider configured.", "provider_error");
  }

  const results: Array<{ templateType: MockupTemplateType; status: "completed" | "failed" | "skipped"; reason?: string }> = [];
  const concurrency = getMockupConcurrency();

  await runWithConcurrencyLimit(templateTypes, concurrency, async (templateType) => {
    try {
      const status = await generateOneMockup(ctx, bundle, design, templateType, provider);
      results.push({ templateType, status });
    } catch (err) {
      if (err instanceof MockupServiceError && err.code === "already_active") {
        results.push({ templateType, status: "skipped", reason: err.message });
      } else {
        results.push({ templateType, status: "failed", reason: err instanceof Error ? err.message : "Unknown error." });
      }
    }
  });

  await recomputeBundleMockupCount(ctx.supabase, bundleId);
  return { results, projectId: bundle.project_id };
}

/**
 * Storage-first delete (mirrors deleteDesign/deleteVectorization): the
 * Storage object is removed before the database row, and the row is
 * deliberately kept if that Storage delete fails.
 */
export async function deleteMockup(ctx: MockupContext, mockupId: string): Promise<{ projectId: string; bundleId: string }> {
  const { data: mockup, error } = await ctx.supabase.from("mockups").select("*").eq("id", mockupId).eq("user_id", ctx.userId).single();
  if (error || !mockup) throw new MockupServiceError("Mockup not found.", "not_found");

  if (mockup.storage_path) {
    const storage = new MockupStorage(ctx.supabase);
    const result = await storage.delete(mockup.storage_path);
    if (!result.ok) {
      throw new MockupServiceError("Could not delete the stored mockup. Please try again.", "storage_error");
    }
  }

  const { error: deleteError } = await ctx.supabase.from("mockups").delete().eq("id", mockupId).eq("user_id", ctx.userId);
  if (deleteError) throw new MockupServiceError(friendlyDbErrorMessage(deleteError, "Could not delete the mockup."), "db_error");

  await recomputeBundleMockupCount(ctx.supabase, mockup.bundle_id);
  return { projectId: mockup.project_id, bundleId: mockup.bundle_id };
}

export async function getMockupDownloadUrl(ctx: MockupContext, mockupId: string): Promise<{ url: string; filename: string }> {
  const { data: mockup, error } = await ctx.supabase.from("mockups").select("*").eq("id", mockupId).eq("user_id", ctx.userId).single();
  if (error || !mockup) throw new MockupServiceError("Mockup not found.", "not_found");
  if (mockup.status !== "completed" || !mockup.storage_path) {
    throw new MockupServiceError("This mockup isn't ready to download yet.", "not_found");
  }

  const filename = `${mockup.template_type}-mockup.png`;
  const storage = new MockupStorage(ctx.supabase);
  const url = await storage.createSignedUrl(mockup.storage_path, 300, filename);
  if (!url) throw new MockupServiceError("Could not prepare the download right now. Please try again.", "storage_error");
  return { url, filename };
}

export async function resolveMockupDisplayUrls(supabase: SupabaseClient<Database>, mockups: Pick<Mockup, "id" | "storage_path" | "status">[]): Promise<Map<string, string | null>> {
  const urlById = new Map<string, string | null>();
  const completed = mockups.filter((m) => m.status === "completed" && m.storage_path);
  if (completed.length === 0) return urlById;

  const storage = new MockupStorage(supabase);
  const paths = completed.map((m) => m.storage_path as string);
  const signedByPath = await storage.createSignedUrls(paths);
  for (const m of completed) {
    urlById.set(m.id, signedByPath.get(m.storage_path as string) ?? null);
  }
  return urlById;
}
