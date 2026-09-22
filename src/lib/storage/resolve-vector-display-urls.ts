import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Vectorization } from "@/types/supabase";
import { DesignStorage } from "@/lib/storage/design-storage";

/**
 * Mirrors resolveDesignDisplayUrls for vector results: a completed
 * vectorization's canonical identity is `storage_bucket` + `storage_path`
 * (never a persisted URL — see vectorize-service.ts), so every page that
 * previews a vector generates a fresh signed URL here, once, in a batch,
 * rather than per-component. A vectorization with no resolvable URL maps
 * to `null`; callers render that as "Preview unavailable".
 */
export async function resolveVectorDisplayUrls(
  supabase: SupabaseClient<Database>,
  vectorizations: Pick<Vectorization, "id" | "storage_path" | "status">[],
): Promise<Map<string, string | null>> {
  const urlById = new Map<string, string | null>();

  const completed = vectorizations.filter((v) => v.status === "completed" && v.storage_path);
  if (completed.length === 0) return urlById;

  const storage = new DesignStorage(supabase);
  const paths = completed.map((v) => v.storage_path as string);
  const signedByPath = await storage.createSignedUrls(paths);

  for (const v of completed) {
    urlById.set(v.id, signedByPath.get(v.storage_path as string) ?? null);
  }

  return urlById;
}
