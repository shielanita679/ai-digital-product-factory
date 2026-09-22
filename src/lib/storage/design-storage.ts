import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/** Private bucket — see supabase/migrations/20260925000000_add_design_storage.sql for creation + RLS. */
export const GENERATED_DESIGNS_BUCKET = "generated-designs";

const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour — plenty for a page view/download, never persisted as canonical.

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type StoredAssetIdentity = {
  bucket: string;
  path: string;
};

/**
 * Every path segment below is a server-derived UUID (`userId`/`projectId`/
 * `designId` all come from already-authenticated, already-ownership-checked
 * database rows — never from user-supplied text), so there is no
 * path-traversal surface and no dependency on a user-provided filename.
 * The leading `{userId}/` segment is also exactly what the Storage RLS
 * policies check against `auth.uid()`, so path shape and access control
 * are two views of the same invariant.
 */
export function buildDesignObjectPath(userId: string, projectId: string, designId: string, mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType] ?? "bin";
  return `${userId}/${projectId}/${designId}/original.${extension}`;
}

export class DesignStorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DesignStorageError";
  }
}

/**
 * Server-side abstraction over Supabase Storage for generated design
 * assets. Always constructed with the caller's own RLS-governed Supabase
 * client (never a service-role client) — Storage RLS policies do the real
 * ownership enforcement, this class just gives the generation service and
 * Server Actions a single, testable place to call instead of scattering
 * `.storage.from(...)` calls throughout the codebase.
 */
export class DesignStorage {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async upload(input: {
    userId: string;
    projectId: string;
    designId: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<StoredAssetIdentity & { sizeBytes: number }> {
    const path = buildDesignObjectPath(input.userId, input.projectId, input.designId, input.mimeType);

    const { error } = await this.supabase.storage.from(GENERATED_DESIGNS_BUCKET).upload(path, input.bytes, {
      contentType: input.mimeType,
      // Retry-safe: a retry/regeneration re-uses the same design id and
      // should overwrite the same object rather than fail or orphan the
      // previous one.
      upsert: true,
    });

    if (error) {
      throw new DesignStorageError(`Could not upload the generated image to storage.`, error);
    }

    return { bucket: GENERATED_DESIGNS_BUCKET, path, sizeBytes: input.bytes.byteLength };
  }

  async createSignedUrl(path: string, expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS): Promise<string | null> {
    const { data, error } = await this.supabase.storage
      .from(GENERATED_DESIGNS_BUCKET)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      // Missing/expired object, revoked access, etc. — callers treat a
      // null signed URL as "image unavailable" and render that state
      // gracefully rather than throwing.
      return null;
    }
    return data.signedUrl;
  }

  /** Batch variant so a gallery of N designs makes one round of signed-URL calls, not N sequential ones. */
  async createSignedUrls(paths: string[], expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS): Promise<Map<string, string>> {
    if (paths.length === 0) return new Map();
    const { data, error } = await this.supabase.storage
      .from(GENERATED_DESIGNS_BUCKET)
      .createSignedUrls(paths, expiresInSeconds);

    const result = new Map<string, string>();
    if (error || !data) return result;
    for (const entry of data) {
      if (entry.signedUrl && !entry.error) {
        result.set(entry.path ?? "", entry.signedUrl);
      }
    }
    return result;
  }

  /**
   * Best-effort delete — returns a result rather than throwing, so callers
   * (see generation-service.deleteDesign) can decide how to treat a
   * storage failure instead of every call site needing a try/catch.
   */
  async delete(path: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase.storage.from(GENERATED_DESIGNS_BUCKET).remove([path]);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async deleteMany(paths: string[]): Promise<{ ok: boolean; failedPaths: string[] }> {
    if (paths.length === 0) return { ok: true, failedPaths: [] };
    const { data, error } = await this.supabase.storage.from(GENERATED_DESIGNS_BUCKET).remove(paths);
    if (error) return { ok: false, failedPaths: paths };
    const removed = new Set((data ?? []).map((d) => d.name));
    const failedPaths = paths.filter((p) => !removed.has(p));
    return { ok: failedPaths.length === 0, failedPaths };
  }
}
