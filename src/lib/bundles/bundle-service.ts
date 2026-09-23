import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Design, ProductBundle, Vectorization } from "@/types/supabase";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { MockupStorage } from "@/lib/storage/mockup-storage";
import { generateBundleCoverPng } from "@/lib/bundles/bundle-cover-service";

export type BundleContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type BundleServiceErrorCode =
  | "not_found"
  | "invalid_config"
  | "png_not_eligible"
  | "svg_not_eligible"
  | "storage_error"
  | "db_error"
  | "migration_not_applied";

export class BundleServiceError extends Error {
  readonly code: BundleServiceErrorCode;
  constructor(message: string, code: BundleServiceErrorCode) {
    super(message);
    this.name = "BundleServiceError";
    this.code = code;
  }
}

/**
 * Eligibility (mirrors the Phase 7 vectorization eligibility rule):
 * PNG is only eligible for a REAL, durably stored raster — `status ===
 * 'completed' && storage_path` set. A Phase 5 mock design's `image_url`
 * is a self-contained data: URI with no durable Storage object behind
 * it, and is deliberately NOT treated as a downloadable raster asset
 * here, even though it superficially "has an image". SVG is only
 * eligible when a `completed` vectorization row exists for the design.
 */
export function getDesignFormatEligibility(design: Pick<Design, "status" | "storage_path">, vectorization: Pick<Vectorization, "status"> | null) {
  const pngEligible = design.status === "completed" && !!design.storage_path;
  const svgEligible = vectorization?.status === "completed";
  return { pngEligible, svgEligible };
}

async function loadOwnedBundle(ctx: BundleContext, bundleId: string): Promise<ProductBundle> {
  const { data, error } = await ctx.supabase.from("product_bundles").select("*").eq("id", bundleId).eq("user_id", ctx.userId).single();
  if (error) {
    if (isMigrationNotAppliedError(error)) {
      throw new BundleServiceError(friendlyDbErrorMessage(error, "Could not load the bundle."), "migration_not_applied");
    }
    throw new BundleServiceError("Bundle not found.", "not_found");
  }
  if (!data) throw new BundleServiceError("Bundle not found.", "not_found");
  return data;
}

async function loadOwnedProject(ctx: BundleContext, projectId: string) {
  const { data, error } = await ctx.supabase.from("projects").select("id").eq("id", projectId).eq("user_id", ctx.userId).single();
  if (error || !data) throw new BundleServiceError("Product not found.", "not_found");
  return data;
}

async function loadOwnedDesignWithVectorization(ctx: BundleContext, designId: string) {
  const { data: design, error } = await ctx.supabase.from("designs").select("*").eq("id", designId).eq("user_id", ctx.userId).single();
  if (error || !design) throw new BundleServiceError("Design not found.", "not_found");

  const { data: vectorization } = await ctx.supabase.from("vectorizations").select("*").eq("design_id", designId).eq("user_id", ctx.userId).maybeSingle();
  return { design, vectorization: vectorization ?? null };
}

export async function createBundle(ctx: BundleContext, projectId: string, name: string): Promise<{ bundleId: string }> {
  await loadOwnedProject(ctx, projectId);
  const trimmed = name.trim();
  if (!trimmed) throw new BundleServiceError("Give this bundle a name.", "invalid_config");

  const { data, error } = await ctx.supabase
    .from("product_bundles")
    .insert({ user_id: ctx.userId, project_id: projectId, name: trimmed })
    .select()
    .single();

  if (error || !data) {
    throw new BundleServiceError(
      friendlyDbErrorMessage(error, "Could not create the bundle."),
      isMigrationNotAppliedError(error) ? "migration_not_applied" : "db_error",
    );
  }
  return { bundleId: data.id };
}

export async function renameBundle(ctx: BundleContext, bundleId: string, name: string): Promise<void> {
  await loadOwnedBundle(ctx, bundleId);
  const trimmed = name.trim();
  if (!trimmed) throw new BundleServiceError("Give this bundle a name.", "invalid_config");

  const { error } = await ctx.supabase.from("product_bundles").update({ name: trimmed }).eq("id", bundleId).eq("user_id", ctx.userId);
  if (error) throw new BundleServiceError(friendlyDbErrorMessage(error, "Could not rename the bundle."), "db_error");
}

/**
 * Adds or updates a design's selection in a bundle. Eligibility is
 * re-verified server-side on every call — never trusts that the UI
 * already disabled an ineligible checkbox, matching the vectorization
 * eligibility pattern in vectorize-service.ts.
 */
export async function setBundleItem(
  ctx: BundleContext,
  bundleId: string,
  designId: string,
  formats: { includePng: boolean; includeSvg: boolean },
): Promise<void> {
  const bundle = await loadOwnedBundle(ctx, bundleId);
  const { design, vectorization } = await loadOwnedDesignWithVectorization(ctx, designId);

  if (design.project_id !== bundle.project_id) {
    throw new BundleServiceError("This design doesn't belong to the bundle's product.", "invalid_config");
  }

  const { pngEligible, svgEligible } = getDesignFormatEligibility(design, vectorization);
  if (formats.includePng && !pngEligible) {
    throw new BundleServiceError("This design has no real stored PNG yet, so PNG can't be included.", "png_not_eligible");
  }
  if (formats.includeSvg && !svgEligible) {
    throw new BundleServiceError("This design has no completed vector result yet, so SVG can't be included.", "svg_not_eligible");
  }
  if (!formats.includePng && !formats.includeSvg) {
    throw new BundleServiceError("Select at least one format, or remove this design from the bundle instead.", "invalid_config");
  }

  const { error } = await ctx.supabase
    .from("bundle_items")
    .upsert(
      { bundle_id: bundleId, design_id: designId, user_id: ctx.userId, include_png: formats.includePng, include_svg: formats.includeSvg },
      { onConflict: "bundle_id,design_id" },
    );
  if (error) {
    throw new BundleServiceError(friendlyDbErrorMessage(error, "Could not update the bundle selection."), "db_error");
  }

  await recomputeBundleItemCount(ctx.supabase, bundleId);
}

export async function removeBundleItem(ctx: BundleContext, bundleId: string, designId: string): Promise<void> {
  await loadOwnedBundle(ctx, bundleId);
  const { error } = await ctx.supabase.from("bundle_items").delete().eq("bundle_id", bundleId).eq("design_id", designId).eq("user_id", ctx.userId);
  if (error) throw new BundleServiceError(friendlyDbErrorMessage(error, "Could not remove the design from the bundle."), "db_error");
  await recomputeBundleItemCount(ctx.supabase, bundleId);
}

/** The single source of truth for product_bundles.item_count — a direct count, never incremented optimistically, mirroring recomputeProjectDesignCount() in generation-service.ts. */
export async function recomputeBundleItemCount(supabase: SupabaseClient<Database>, bundleId: string): Promise<void> {
  const { count } = await supabase.from("bundle_items").select("id", { count: "exact", head: true }).eq("bundle_id", bundleId);
  await supabase.from("product_bundles").update({ item_count: count ?? 0 }).eq("id", bundleId);
}

/** Mirrors recomputeBundleItemCount for mockup_count — called by MockupService after any mockup create/delete. */
export async function recomputeBundleMockupCount(supabase: SupabaseClient<Database>, bundleId: string): Promise<void> {
  const { count } = await supabase.from("mockups").select("id", { count: "exact", head: true }).eq("bundle_id", bundleId).eq("status", "completed");
  await supabase.from("product_bundles").update({ mockup_count: count ?? 0 }).eq("id", bundleId);
}

/**
 * Generates (or regenerates) the bundle's cover from its currently
 * selected items — a thin service wrapper around
 * bundle-cover-service.ts's pure generator, handling ownership,
 * gathering representative titles/formats, and the Storage upload +
 * row update. Never calls OpenAI or any paid provider (see
 * generateBundleCoverPng's own doc comment).
 */
export async function generateBundleCover(ctx: BundleContext, bundleId: string): Promise<void> {
  const bundle = await loadOwnedBundle(ctx, bundleId);

  const { data: items, error } = await ctx.supabase
    .from("bundle_items")
    .select("include_png, include_svg, designs(title)")
    .eq("bundle_id", bundleId)
    .eq("user_id", ctx.userId);
  if (error) throw new BundleServiceError(friendlyDbErrorMessage(error, "Could not load bundle items."), "db_error");

  const rows = items ?? [];
  const formats = {
    png: rows.some((r) => r.include_png),
    svg: rows.some((r) => r.include_svg),
  };
  const representativeDesignTitles = rows
    .map((r) => (r.designs as unknown as { title: string } | null)?.title)
    .filter((t): t is string => !!t);

  const cover = await generateBundleCoverPng({
    bundleId,
    bundleName: bundle.name,
    itemCount: rows.length,
    formats,
    representativeDesignTitles,
  });

  try {
    const storage = new MockupStorage(ctx.supabase);
    const uploaded = await storage.uploadCover({ userId: ctx.userId, projectId: bundle.project_id, bundleId, bytes: cover.bytes });
    const { error: updateError } = await ctx.supabase
      .from("product_bundles")
      .update({ cover_storage_bucket: uploaded.bucket, cover_storage_path: uploaded.path })
      .eq("id", bundleId);
    if (updateError) throw updateError;
  } catch (err) {
    throw new BundleServiceError(
      err instanceof Error ? `Could not save the bundle cover: ${err.message}` : "Could not save the bundle cover.",
      "storage_error",
    );
  }
}

/**
 * Storage-first delete (mirrors deleteDesign/cleanupProjectStorage in
 * generation-service.ts): the cover and every mockup's Storage object
 * are removed BEFORE the bundle row, so a Storage failure never leaves
 * an orphan with nothing left to find it — the row stays if any object
 * fails to delete, exactly like the Phase 7 delete pattern.
 */
export async function deleteBundle(ctx: BundleContext, bundleId: string): Promise<void> {
  const bundle = await loadOwnedBundle(ctx, bundleId);

  const { data: mockups } = await ctx.supabase.from("mockups").select("storage_path").eq("bundle_id", bundleId).eq("user_id", ctx.userId).not("storage_path", "is", null);

  const paths = [bundle.cover_storage_path, ...(mockups ?? []).map((m) => m.storage_path)].filter((p): p is string => !!p);

  if (paths.length > 0) {
    const storage = new MockupStorage(ctx.supabase);
    const result = await storage.deleteMany(paths);
    if (!result.ok) {
      throw new BundleServiceError("Could not delete all stored bundle assets. Please try again.", "storage_error");
    }
  }

  const { error } = await ctx.supabase.from("product_bundles").delete().eq("id", bundleId).eq("user_id", ctx.userId);
  if (error) throw new BundleServiceError(friendlyDbErrorMessage(error, "Could not delete the bundle."), "db_error");
}

/** Bulk resolver for a project's bundle list page — returns designs' eligibility keyed by design id, for a batch of designs at once. */
export async function resolveDesignEligibility(
  supabase: SupabaseClient<Database>,
  designs: Pick<Design, "id" | "status" | "storage_path">[],
): Promise<Map<string, { pngEligible: boolean; svgEligible: boolean }>> {
  const result = new Map<string, { pngEligible: boolean; svgEligible: boolean }>();
  if (designs.length === 0) return result;

  const { data: vectorizations } = await supabase
    .from("vectorizations")
    .select("design_id, status")
    .in("design_id", designs.map((d) => d.id));
  const vecByDesignId = new Map((vectorizations ?? []).map((v) => [v.design_id, v]));

  for (const design of designs) {
    result.set(design.id, getDesignFormatEligibility(design, vecByDesignId.get(design.id) ?? null));
  }
  return result;
}
