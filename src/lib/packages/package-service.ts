import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

import type { Database, Json, ProductPackage } from "@/types/supabase";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { DesignStorage, DesignStorageError } from "@/lib/storage/design-storage";
import { MockupStorage } from "@/lib/storage/mockup-storage";
import { PackageStorage } from "@/lib/storage/package-storage";
import { sniffImageMimeType } from "@/lib/ai/provider-http";
import { marketplaceLabel, type MarketplaceId } from "@/config/marketplaces";
import type { MockupTemplateType } from "@/lib/mockups/mockup-provider";
import { bundleSlug, designBaseFilename, buildMockupFilenames, packageFileName } from "@/lib/packages/filename-utils";
import { buildListingText, buildLicenseText } from "@/lib/packages/package-text-builder";
import { buildReadmeText } from "@/lib/packages/package-readme-builder";
import { buildPackageManifest, type ManifestFileEntry } from "@/lib/packages/package-manifest-builder";
import { buildZipBuffer, type ZipBinaryAsset, type ZipTextAsset } from "@/lib/packages/zip-builder";
import {
  MAX_PACKAGE_SOURCE_ASSET_COUNT,
  MAX_PACKAGE_ASSET_SIZE_BYTES,
  MAX_PACKAGE_TOTAL_INPUT_BYTES,
  formatBytesForError,
} from "@/config/packaging-limits";

export type PackageContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type PackageServiceErrorCode =
  | "not_found"
  | "invalid_config"
  | "asset_missing"
  | "size_limit_exceeded"
  | "storage_error"
  | "zip_error"
  | "db_error"
  | "migration_not_applied";

export class PackageServiceError extends Error {
  readonly code: PackageServiceErrorCode;
  constructor(message: string, code: PackageServiceErrorCode) {
    super(message);
    this.name = "PackageServiceError";
    this.code = code;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function loadOwnedBundle(ctx: PackageContext, bundleId: string) {
  const { data, error } = await ctx.supabase.from("product_bundles").select("*").eq("id", bundleId).eq("user_id", ctx.userId).single();
  if (error || !data) {
    if (isMigrationNotAppliedError(error)) {
      throw new PackageServiceError(friendlyDbErrorMessage(error, "Could not load the bundle."), "migration_not_applied");
    }
    throw new PackageServiceError("Bundle not found.", "not_found");
  }
  return data;
}

type GatheredItem = {
  designId: string;
  designTitle: string;
  includePng: boolean;
  includeSvg: boolean;
  design: { status: string; storage_path: string | null } | null;
  vectorization: { status: string; storage_path: string | null } | null;
};

/** Authoritative, server-loaded view of a bundle's selected items — never trusts bundle_items' include_png/include_svg flags alone without re-checking the design/vectorization rows they claim exist. */
async function gatherBundleItems(ctx: PackageContext, bundleId: string): Promise<GatheredItem[]> {
  const { data: itemRows } = await ctx.supabase
    .from("bundle_items")
    .select("*")
    .eq("bundle_id", bundleId)
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: true });
  const items = itemRows ?? [];
  if (items.length === 0) return [];

  const designIds = items.map((i) => i.design_id as string);
  const { data: designRows } = await ctx.supabase.from("designs").select("id, title, status, storage_path").in("id", designIds).eq("user_id", ctx.userId);
  const designById = new Map((designRows ?? []).map((d) => [d.id as string, d]));

  const { data: vecRows } = await ctx.supabase.from("vectorizations").select("design_id, status, storage_path").in("design_id", designIds).eq("user_id", ctx.userId);
  const vecByDesignId = new Map((vecRows ?? []).map((v) => [v.design_id as string, v]));

  return items.map((item) => {
    const designId = item.design_id as string;
    const design = designById.get(designId) ?? null;
    const vectorization = vecByDesignId.get(designId) ?? null;
    return {
      designId,
      designTitle: (design?.title as string) ?? "Untitled design",
      includePng: !!item.include_png,
      includeSvg: !!item.include_svg,
      design: design ? { status: design.status as string, storage_path: design.storage_path as string | null } : null,
      vectorization: vectorization ? { status: vectorization.status as string, storage_path: vectorization.storage_path as string | null } : null,
    };
  });
}

function computeBlockingIssues(items: GatheredItem[]): string[] {
  const blocking: string[] = [];
  if (items.length === 0) {
    blocking.push("Select at least one bundle item.");
    return blocking;
  }
  for (const item of items) {
    if (item.includePng && !(item.design?.status === "completed" && item.design.storage_path)) {
      blocking.push(`PNG requested for "${item.designTitle}" but no completed raster exists.`);
    }
    if (item.includeSvg && item.vectorization?.status !== "completed") {
      blocking.push(`SVG requested for "${item.designTitle}" but no completed vector exists.`);
    }
  }
  return blocking;
}

export type PrerequisiteCheck = { ok: boolean; blocking: string[]; warnings: string[] };

/**
 * Pre-flight check the UI calls before enabling "Build Package" and to
 * explain exactly what's missing (Phase 10 spec section 19) — never a
 * vague "something went wrong". `blocking` issues would make buildPackage
 * itself fail; `warnings` describe optional content (listing/license/
 * mockups/cover) that will simply be omitted from the ZIP, matching
 * section 1's "never fabricate missing assets" rule.
 */
export async function checkPackagePrerequisites(ctx: PackageContext, bundleId: string, marketplace: MarketplaceId): Promise<PrerequisiteCheck> {
  const bundle = await loadOwnedBundle(ctx, bundleId);
  const items = await gatherBundleItems(ctx, bundleId);
  const blocking = computeBlockingIssues(items);
  const warnings: string[] = [];

  const { data: listing } = await ctx.supabase
    .from("product_listings")
    .select("title, license_type")
    .eq("bundle_id", bundleId)
    .eq("marketplace", marketplace)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!listing || !listing.title) {
    warnings.push(`Listing not created for ${marketplaceLabel(marketplace)}.`);
  } else if (!listing.license_type) {
    warnings.push(`License not created for ${marketplaceLabel(marketplace)}.`);
  }

  if (!bundle.cover_storage_path) {
    warnings.push("No bundle cover generated yet.");
  }

  const designIds = items.map((i) => i.designId);
  const { count: mockupCount } =
    designIds.length > 0
      ? await ctx.supabase.from("mockups").select("id", { count: "exact", head: true }).eq("bundle_id", bundleId).eq("status", "completed").in("design_id", designIds)
      : { count: 0 };
  if (!mockupCount) {
    warnings.push("No mockups generated yet.");
  }

  return { ok: blocking.length === 0, blocking, warnings };
}

async function getOrCreatePackageRow(ctx: PackageContext, bundle: { id: string; project_id: string }, marketplace: MarketplaceId): Promise<ProductPackage> {
  const { data: existing } = await ctx.supabase.from("product_packages").select("*").eq("bundle_id", bundle.id).eq("marketplace", marketplace).eq("user_id", ctx.userId).maybeSingle();
  if (existing) return existing;

  const { data, error } = await ctx.supabase
    .from("product_packages")
    .insert({ user_id: ctx.userId, project_id: bundle.project_id, bundle_id: bundle.id, marketplace, status: "queued" })
    .select()
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      // Concurrent create raced us — re-read the now-existing canonical row instead of failing.
      const { data: raced } = await ctx.supabase.from("product_packages").select("*").eq("bundle_id", bundle.id).eq("marketplace", marketplace).eq("user_id", ctx.userId).single();
      if (raced) return raced;
    }
    throw new PackageServiceError(friendlyDbErrorMessage(error, "Could not create the package record."), isMigrationNotAppliedError(error) ? "migration_not_applied" : "db_error");
  }
  return data;
}

async function markFailed(ctx: PackageContext, packageId: string, message: string): Promise<void> {
  await ctx.supabase.from("product_packages").update({ status: "failed", error_message: message }).eq("id", packageId).eq("user_id", ctx.userId);
}

/**
 * Builds (or rebuilds) the ZIP package for one bundle+marketplace.
 *
 * IDEMPOTENCY / REBUILD SAFETY (Phase 10 spec sections 16/17): the ENTIRE
 * ZIP is assembled and validated in memory first — every source asset is
 * downloaded, magic-byte-validated, and packed into a Buffer via
 * ZipBuilder — before Storage or the database is touched in any way that
 * could destroy the previous build. Only once that buffer exists does this
 * function (a) upload it to the canonical Storage path with upsert:true,
 * which is an atomic PUT — a failed upload leaves whatever object was
 * already at that path completely untouched — and (b) update the DB row's
 * storage_path/checksum/size/version/completed_at fields, again only on
 * success. Any failure anywhere in this function marks the row
 * status='failed' with error_message set, but never clears the previous
 * storage_path/checksum/version — a failed rebuild always preserves the
 * last valid downloadable package. See status's own doc comment in the
 * migration for the full "status = last attempt, storage_path = last
 * success" split this relies on.
 */
export async function buildPackage(ctx: PackageContext, bundleId: string, marketplace: MarketplaceId): Promise<{ packageId: string }> {
  const bundle = await loadOwnedBundle(ctx, bundleId);
  const pkgRow = await getOrCreatePackageRow(ctx, bundle, marketplace);

  const items = await gatherBundleItems(ctx, bundleId);
  const blocking = computeBlockingIssues(items);
  if (blocking.length > 0) {
    await markFailed(ctx, pkgRow.id, blocking.join(" "));
    throw new PackageServiceError(blocking.join(" "), "asset_missing");
  }

  await ctx.supabase.from("product_packages").update({ status: "building", error_message: null }).eq("id", pkgRow.id).eq("user_id", ctx.userId);

  try {
    const designStorage = new DesignStorage(ctx.supabase);
    const mockupStorage = new MockupStorage(ctx.supabase);

    let sourceAssetCount = 0;
    let totalInputBytes = 0;
    function trackSize(bytes: Buffer, label: string): void {
      sourceAssetCount += 1;
      if (sourceAssetCount > MAX_PACKAGE_SOURCE_ASSET_COUNT) {
        throw new PackageServiceError(`This package would include more than ${MAX_PACKAGE_SOURCE_ASSET_COUNT} files, which exceeds the packaging limit.`, "size_limit_exceeded");
      }
      if (bytes.byteLength > MAX_PACKAGE_ASSET_SIZE_BYTES) {
        throw new PackageServiceError(`"${label}" (${formatBytesForError(bytes.byteLength)}) exceeds the ${formatBytesForError(MAX_PACKAGE_ASSET_SIZE_BYTES)} per-file packaging limit.`, "size_limit_exceeded");
      }
      totalInputBytes += bytes.byteLength;
      if (totalInputBytes > MAX_PACKAGE_TOTAL_INPUT_BYTES) {
        throw new PackageServiceError(`This package's total source size exceeds the ${formatBytesForError(MAX_PACKAGE_TOTAL_INPUT_BYTES)} packaging limit.`, "size_limit_exceeded");
      }
    }

    const includedDesigns = items.filter((i) => i.includePng || i.includeSvg);
    const manifestFiles: ManifestFileEntry[] = [];
    const pngAssets: ZipBinaryAsset[] = [];
    const svgAssets: ZipBinaryAsset[] = [];

    for (let index = 0; index < includedDesigns.length; index++) {
      const item = includedDesigns[index];
      const baseName = designBaseFilename(index, includedDesigns.length, item.designTitle);

      if (item.includePng) {
        const bytes = await designStorage.download(item.design!.storage_path!);
        trackSize(bytes, `${baseName}.png`);
        if (sniffImageMimeType(bytes) !== "image/png") {
          throw new PackageServiceError(`The stored PNG for "${item.designTitle}" failed validation.`, "asset_missing");
        }
        const path = `PNG/${baseName}.png`;
        pngAssets.push({ path, bytes });
        manifestFiles.push({ path, type: "png", sourceDesignId: item.designId, byteSize: bytes.byteLength });
      }
      if (item.includeSvg) {
        const bytes = await designStorage.download(item.vectorization!.storage_path!);
        trackSize(bytes, `${baseName}.svg`);
        // Already validated/sanitized once by the Phase 7 vectorization
        // pipeline (validateAndSanitizeSvg) before it was ever stored — this
        // is a lightweight sanity check against Storage-level corruption,
        // not a re-sanitization pass (spec section 26: "SVG must come only
        // from our sanitized completed vectorization pipeline", which this
        // path already guarantees via item.vectorization.status === 'completed').
        const text = bytes.toString("utf8").trimStart();
        if (!text.startsWith("<?xml") && !text.startsWith("<svg")) {
          throw new PackageServiceError(`The stored SVG for "${item.designTitle}" failed validation.`, "asset_missing");
        }
        const path = `SVG/${baseName}.svg`;
        svgAssets.push({ path, bytes });
        manifestFiles.push({ path, type: "svg", sourceDesignId: item.designId, byteSize: bytes.byteLength });
      }
    }

    const designIndexByDesignId = new Map(includedDesigns.map((item, idx) => [item.designId, idx]));
    const { data: mockupRows } =
      includedDesigns.length > 0
        ? await ctx.supabase
            .from("mockups")
            .select("design_id, template_type, storage_path")
            .eq("bundle_id", bundleId)
            .eq("user_id", ctx.userId)
            .eq("status", "completed")
            .in("design_id", includedDesigns.map((i) => i.designId))
            .order("created_at", { ascending: true })
        : { data: [] };
    const eligibleMockups = (mockupRows ?? []).filter((m) => m.storage_path && designIndexByDesignId.has(m.design_id as string));
    const mockupFilenames = buildMockupFilenames(
      eligibleMockups.map((m) => ({ templateType: m.template_type as MockupTemplateType, designIndex: designIndexByDesignId.get(m.design_id as string)! })),
    );

    const mockupAssets: ZipBinaryAsset[] = [];
    for (let i = 0; i < eligibleMockups.length; i++) {
      const m = eligibleMockups[i];
      const bytes = await mockupStorage.download(m.storage_path as string);
      trackSize(bytes, mockupFilenames[i]);
      if (sniffImageMimeType(bytes) !== "image/png") {
        throw new PackageServiceError("A stored mockup failed validation.", "asset_missing");
      }
      const path = `MOCKUPS/${mockupFilenames[i]}`;
      mockupAssets.push({ path, bytes });
      manifestFiles.push({ path, type: "mockup", sourceDesignId: m.design_id as string, byteSize: bytes.byteLength });
    }

    let coverAsset: ZipBinaryAsset | null = null;
    if (bundle.cover_storage_path) {
      const bytes = await mockupStorage.download(bundle.cover_storage_path);
      trackSize(bytes, "bundle-cover.png");
      if (sniffImageMimeType(bytes) !== "image/png") {
        throw new PackageServiceError("The stored bundle cover failed validation.", "asset_missing");
      }
      coverAsset = { path: "PREVIEW/bundle-cover.png", bytes };
      manifestFiles.push({ path: coverAsset.path, type: "cover", byteSize: bytes.byteLength });
    }

    const { data: listingRow } = await ctx.supabase
      .from("product_listings")
      .select("*")
      .eq("bundle_id", bundleId)
      .eq("marketplace", marketplace)
      .eq("user_id", ctx.userId)
      .maybeSingle();

    const textAssets: ZipTextAsset[] = [];
    let hasListing = false;
    let hasLicense = false;

    if (listingRow && listingRow.title) {
      const listingText = buildListingText({
        title: listingRow.title,
        description: listingRow.description,
        tags: asStringArray(listingRow.tags),
        seoKeywords: asStringArray(listingRow.seo_keywords),
        includedFiles: asStringArray(listingRow.included_files),
        materials: asStringArray(listingRow.materials),
      });
      textAssets.push({ path: "listing.txt", content: listingText });
      manifestFiles.push({ path: "listing.txt", type: "listing", byteSize: Buffer.byteLength(listingText, "utf8") });
      hasListing = true;

      if (listingRow.license_type && listingRow.license_text) {
        const licenseText = buildLicenseText(listingRow.license_text);
        textAssets.push({ path: "license.txt", content: licenseText });
        manifestFiles.push({ path: "license.txt", type: "license", byteSize: Buffer.byteLength(licenseText, "utf8") });
        hasLicense = true;
      }
    }

    const readmeText = buildReadmeText({
      pngCount: pngAssets.length,
      svgCount: svgAssets.length,
      mockupCount: mockupAssets.length,
      hasCover: !!coverAsset,
      hasListing,
      hasLicense,
    });
    textAssets.push({ path: "README.txt", content: readmeText });
    manifestFiles.push({ path: "README.txt", type: "readme", byteSize: Buffer.byteLength(readmeText, "utf8") });

    const binaryAssets = [...pngAssets, ...svgAssets, ...mockupAssets, ...(coverAsset ? [coverAsset] : [])];
    const root = bundleSlug(bundle.name);
    const zipResult = await buildZipBuffer({ rootFolder: root, binaryAssets, textAssets });

    const checksum = createHash("sha256").update(zipResult.bytes).digest("hex");

    const packageStorage = new PackageStorage(ctx.supabase);
    const uploaded = await packageStorage.uploadZip({ userId: ctx.userId, projectId: bundle.project_id, bundleId: bundle.id, marketplace, bytes: zipResult.bytes });

    const verifyUrl = await packageStorage.createDownloadUrl(uploaded.path, "verify.zip");
    if (!verifyUrl) {
      throw new PackageServiceError("The package was uploaded but could not be verified. Please try again.", "storage_error");
    }

    const nextVersion = (pkgRow.version ?? 0) + 1;
    const manifest = buildPackageManifest({ version: nextVersion, bundleId: bundle.id, bundleName: bundle.name, marketplace, files: manifestFiles });
    const fileName = packageFileName(bundle.name, marketplace);

    const { error: updateError } = await ctx.supabase
      .from("product_packages")
      .update({
        status: "completed",
        version: nextVersion,
        storage_bucket: uploaded.bucket,
        storage_path: uploaded.path,
        file_name: fileName,
        file_size_bytes: uploaded.sizeBytes,
        checksum_sha256: checksum,
        item_count: zipResult.entryCount,
        manifest: manifest as unknown as Json,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", pkgRow.id)
      .eq("user_id", ctx.userId);
    if (updateError) {
      throw new PackageServiceError(friendlyDbErrorMessage(updateError, "The package was built but could not be saved."), "db_error");
    }

    return { packageId: pkgRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build the package.";
    await markFailed(ctx, pkgRow.id, message);
    if (err instanceof PackageServiceError) throw err;
    // DesignStorage/MockupStorage/PackageStorage all throw DesignStorageError
    // for a download OR upload failure — surfaced here as storage_error
    // rather than the generic zip_error fallback, so callers (and the UI)
    // can tell "we couldn't read/write Storage" apart from "the ZIP itself
    // was malformed".
    if (err instanceof DesignStorageError) throw new PackageServiceError(message, "storage_error");
    throw new PackageServiceError(message, "zip_error");
  }
}

/** Storage-first delete (mirrors deleteMockup/deleteBundle): the ZIP object is removed before the database row, and the row is deliberately kept if that Storage delete fails. */
export async function deletePackage(ctx: PackageContext, packageId: string): Promise<{ projectId: string; bundleId: string }> {
  const { data: pkg, error } = await ctx.supabase.from("product_packages").select("*").eq("id", packageId).eq("user_id", ctx.userId).single();
  if (error || !pkg) throw new PackageServiceError("Package not found.", "not_found");

  if (pkg.storage_path) {
    const storage = new PackageStorage(ctx.supabase);
    const result = await storage.delete(pkg.storage_path);
    if (!result.ok) {
      throw new PackageServiceError("Could not delete the stored package. Please try again.", "storage_error");
    }
  }

  const { error: deleteError } = await ctx.supabase.from("product_packages").delete().eq("id", packageId).eq("user_id", ctx.userId);
  if (deleteError) throw new PackageServiceError(friendlyDbErrorMessage(deleteError, "Could not delete the package."), "db_error");

  return { projectId: pkg.project_id, bundleId: pkg.bundle_id };
}

/** Short-lived (300s), presentation-only signed URL — never persisted, never derived from any client-supplied path (spec section 20). */
export async function getPackageDownloadUrl(ctx: PackageContext, packageId: string): Promise<{ url: string; filename: string }> {
  const { data: pkg, error } = await ctx.supabase.from("product_packages").select("*").eq("id", packageId).eq("user_id", ctx.userId).single();
  if (error || !pkg) throw new PackageServiceError("Package not found.", "not_found");
  if (!pkg.storage_path) throw new PackageServiceError("This package hasn't been built yet.", "not_found");

  const filename = pkg.file_name ?? "package.zip";
  const storage = new PackageStorage(ctx.supabase);
  const url = await storage.createDownloadUrl(pkg.storage_path, filename);
  if (!url) throw new PackageServiceError("Could not prepare the download right now. Please try again.", "storage_error");
  return { url, filename };
}

/** All package rows (built or not) for one bundle — used by the bundle detail page's Package section, which shows a "Not Built" state per marketplace even before any row exists. */
export async function loadPackagesForBundle(ctx: PackageContext, bundleId: string): Promise<ProductPackage[]> {
  const { data, error } = await ctx.supabase.from("product_packages").select("*").eq("bundle_id", bundleId).eq("user_id", ctx.userId);
  if (error) {
    if (isMigrationNotAppliedError(error)) return [];
    throw new PackageServiceError(friendlyDbErrorMessage(error, "Could not load packages."), "db_error");
  }
  return data ?? [];
}

export type PackageWithContext = ProductPackage & { bundleName: string; projectName: string; projectId: string };

/** Download Center — only packages that have at least one successful build (storage_path set), newest first. */
export async function loadMyPackages(ctx: PackageContext): Promise<PackageWithContext[]> {
  const { data: packages, error } = await ctx.supabase
    .from("product_packages")
    .select("*")
    .eq("user_id", ctx.userId)
    .not("storage_path", "is", null)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isMigrationNotAppliedError(error)) return [];
    throw new PackageServiceError(friendlyDbErrorMessage(error, "Could not load your packages."), "db_error");
  }
  const rows = packages ?? [];
  if (rows.length === 0) return [];

  const bundleIds = [...new Set(rows.map((r) => r.bundle_id))];
  const { data: bundles } = await ctx.supabase.from("product_bundles").select("id, name, project_id").in("id", bundleIds).eq("user_id", ctx.userId);
  const bundleById = new Map((bundles ?? []).map((b) => [b.id as string, b]));

  const projectIds = [...new Set((bundles ?? []).map((b) => b.project_id as string))];
  const { data: projects } = projectIds.length > 0 ? await ctx.supabase.from("projects").select("id, name").in("id", projectIds).eq("user_id", ctx.userId) : { data: [] };
  const projectById = new Map((projects ?? []).map((p) => [p.id as string, p]));

  return rows.map((r) => {
    const bundle = bundleById.get(r.bundle_id);
    const project = bundle ? projectById.get(bundle.project_id as string) : undefined;
    return {
      ...r,
      bundleName: (bundle?.name as string) ?? "Unknown bundle",
      projectName: (project?.name as string) ?? "Unknown product",
      projectId: (bundle?.project_id as string) ?? "",
    };
  });
}
