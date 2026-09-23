import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import { GENERATED_DESIGNS_BUCKET, DesignStorageError, type StoredAssetIdentity } from "@/lib/storage/design-storage";

/**
 * Phase 8 assets (mockups, bundle covers) reuse the SAME private
 * generated-designs bucket as raster/vector designs — re-exported here so
 * callers only need to import from this module. See the "Storage"
 * section of 20260928000000_create_bundles_and_mockups.sql for why no
 * new bucket or Storage policies are needed: the existing policies only
 * check the first path segment (`{user_id}/...`) against auth.uid(),
 * and every path below still starts with exactly that.
 */
export const BUNDLES_BUCKET = GENERATED_DESIGNS_BUCKET;

/**
 * Every segment is a server-derived UUID from an already-authenticated,
 * already-ownership-checked row — never user-supplied text — so there is
 * no path-traversal surface, matching buildDesignObjectPath /
 * buildVectorObjectPath in design-storage.ts.
 */
export function buildMockupObjectPath(userId: string, projectId: string, bundleId: string, mockupId: string): string {
  return `${userId}/${projectId}/bundles/${bundleId}/mockups/${mockupId}.png`;
}

export function buildBundleCoverObjectPath(userId: string, projectId: string, bundleId: string): string {
  return `${userId}/${projectId}/bundles/${bundleId}/cover.png`;
}

const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Server-side abstraction over Supabase Storage for Phase 8 assets —
 * mirrors DesignStorage's shape (design-storage.ts) so the two read the
 * same way. Always constructed with the caller's own RLS-governed
 * Supabase client, never a service-role client.
 */
export class MockupStorage {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async uploadMockup(input: {
    userId: string;
    projectId: string;
    bundleId: string;
    mockupId: string;
    bytes: Buffer;
  }): Promise<StoredAssetIdentity & { sizeBytes: number }> {
    const path = buildMockupObjectPath(input.userId, input.projectId, input.bundleId, input.mockupId);
    const { error } = await this.supabase.storage.from(BUNDLES_BUCKET).upload(path, input.bytes, {
      contentType: "image/png",
      // Retry-safe: retrying a failed mockup re-uses the same mockup id
      // and should overwrite the same object, never orphan the previous one.
      upsert: true,
    });
    if (error) {
      throw new DesignStorageError(`Could not upload the mockup image to storage.`, error);
    }
    return { bucket: BUNDLES_BUCKET, path, sizeBytes: input.bytes.byteLength };
  }

  async uploadCover(input: {
    userId: string;
    projectId: string;
    bundleId: string;
    bytes: Buffer;
  }): Promise<StoredAssetIdentity & { sizeBytes: number }> {
    const path = buildBundleCoverObjectPath(input.userId, input.projectId, input.bundleId);
    const { error } = await this.supabase.storage.from(BUNDLES_BUCKET).upload(path, input.bytes, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) {
      throw new DesignStorageError(`Could not upload the bundle cover to storage.`, error);
    }
    return { bucket: BUNDLES_BUCKET, path, sizeBytes: input.bytes.byteLength };
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(BUNDLES_BUCKET).download(path);
    if (error || !data) {
      throw new DesignStorageError(`Could not download the stored object: ${path}`, error);
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async createSignedUrl(path: string, expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS, downloadFilename?: string): Promise<string | null> {
    const { data, error } = await this.supabase.storage
      .from(BUNDLES_BUCKET)
      .createSignedUrl(path, expiresInSeconds, downloadFilename ? { download: downloadFilename } : undefined);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  async createSignedUrls(paths: string[], expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map();
    const { data, error } = await this.supabase.storage.from(BUNDLES_BUCKET).createSignedUrls(paths, expiresInSeconds);
    const result = new Map<string, string>();
    if (error || !data) return result;
    for (const entry of data) {
      if (entry.signedUrl && !entry.error) result.set(entry.path ?? "", entry.signedUrl);
    }
    return result;
  }

  /** Storage-first delete is enforced by callers (BundleService/MockupService), not here — see their doc comments. */
  async delete(path: string): Promise<{ ok: boolean; error?: string }> {
    const result = await this.deleteMany([path]);
    if (!result.ok) return { ok: false, error: `Object was not removed: ${path}` };
    return { ok: true };
  }

  async deleteMany(paths: string[]): Promise<{ ok: boolean; failedPaths: string[] }> {
    if (paths.length === 0) return { ok: true, failedPaths: [] };
    const { data, error } = await this.supabase.storage.from(BUNDLES_BUCKET).remove(paths);
    if (error) return { ok: false, failedPaths: paths };
    const removed = new Set((data ?? []).map((d) => d.name));
    const failedPaths = paths.filter((p) => !removed.has(p));
    return { ok: failedPaths.length === 0, failedPaths };
  }
}
