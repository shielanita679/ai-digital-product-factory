import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import { GENERATED_DESIGNS_BUCKET, DesignStorageError, type StoredAssetIdentity } from "@/lib/storage/design-storage";

/**
 * Phase 10 packages reuse the SAME private generated-designs bucket as
 * every earlier phase's assets — see the "Storage Architecture" section of
 * the Phase 10 spec and 20261002000000_create_product_packages.sql's own
 * Storage comment for why no new bucket is needed: the existing Storage
 * RLS policies only check the first path segment (`{user_id}/...`) against
 * auth.uid(), and the canonical package path below still starts with
 * exactly that.
 */
export const PACKAGES_BUCKET = GENERATED_DESIGNS_BUCKET;

/**
 * One canonical, deterministic, server-derived path per (bundle,
 * marketplace) — every segment (userId/projectId/bundleId) comes from an
 * already-authenticated, already-ownership-checked row, and `marketplace`
 * is validated against MARKETPLACE_VALUES before ever reaching here, never
 * raw client text. Rebuilding a package overwrites this exact same path
 * (upsert) rather than creating a new object each time — see
 * PackageService.buildPackage's doc comment for why an upload failure at
 * this path can never destroy the previous valid ZIP.
 */
export function buildPackageObjectPath(userId: string, projectId: string, bundleId: string, marketplace: string): string {
  return `${userId}/${projectId}/bundles/${bundleId}/package/${marketplace}.zip`;
}

const DOWNLOAD_SIGNED_URL_EXPIRY_SECONDS = 300; // Phase 10 spec section 20: short-lived, presentation-only.

/**
 * Server-side abstraction over Supabase Storage for Phase 10 package ZIPs
 * — mirrors MockupStorage/DesignStorage's shape so all three read the same
 * way. Always constructed with the caller's own RLS-governed Supabase
 * client, never a service-role client.
 */
export class PackageStorage {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async uploadZip(input: { userId: string; projectId: string; bundleId: string; marketplace: string; bytes: Buffer }): Promise<StoredAssetIdentity & { sizeBytes: number }> {
    const path = buildPackageObjectPath(input.userId, input.projectId, input.bundleId, input.marketplace);
    const { error } = await this.supabase.storage.from(PACKAGES_BUCKET).upload(path, input.bytes, {
      contentType: "application/zip",
      // Rebuild-safe: overwrites the SAME canonical object. Supabase
      // Storage's upload is an atomic PUT — a failed upload never leaves a
      // partially-written object, so the previous valid ZIP survives any
      // upload failure untouched (see buildPackageObjectPath's doc comment).
      upsert: true,
    });
    if (error) {
      throw new DesignStorageError(`Could not upload the package ZIP to storage.`, error);
    }
    return { bucket: PACKAGES_BUCKET, path, sizeBytes: input.bytes.byteLength };
  }

  /** Short-lived (300s) signed download URL, never persisted — see product_packages.storage_path being the only canonical identity stored. */
  async createDownloadUrl(path: string, downloadFilename: string): Promise<string | null> {
    const { data, error } = await this.supabase.storage
      .from(PACKAGES_BUCKET)
      .createSignedUrl(path, DOWNLOAD_SIGNED_URL_EXPIRY_SECONDS, { download: downloadFilename });
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  async delete(path: string): Promise<{ ok: boolean; error?: string }> {
    const result = await this.deleteMany([path]);
    if (!result.ok) return { ok: false, error: `Object was not removed: ${path}` };
    return { ok: true };
  }

  async deleteMany(paths: string[]): Promise<{ ok: boolean; failedPaths: string[] }> {
    if (paths.length === 0) return { ok: true, failedPaths: [] };
    const { data, error } = await this.supabase.storage.from(PACKAGES_BUCKET).remove(paths);
    if (error) return { ok: false, failedPaths: paths };
    const removed = new Set((data ?? []).map((d) => d.name));
    const failedPaths = paths.filter((p) => !removed.has(p));
    return { ok: failedPaths.length === 0, failedPaths };
  }
}
