import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Design } from "@/types/supabase";
import { DesignStorage } from "@/lib/storage/design-storage";

/**
 * The single reusable place that turns a batch of design rows into
 * display-ready URLs — mock designs already carry a self-contained
 * `image_url` data: URI, real designs need a freshly generated signed
 * URL from their durable `storage_path`. Every page that renders designs
 * (project detail, /dashboard/designs, dashboard recent designs) calls
 * this once instead of generating signed URLs itself, per design, in a
 * dozen different components.
 *
 * A design with no resolvable URL (rare — a Storage hiccup, or a stale
 * signed-URL failure) maps to `null`; callers render that as "Image
 * unavailable" rather than a broken `<img>` tag.
 */
export async function resolveDesignDisplayUrls(
  supabase: SupabaseClient<Database>,
  designs: Pick<Design, "id" | "image_url" | "storage_path">[],
): Promise<Map<string, string | null>> {
  const displayUrlById = new Map<string, string | null>();

  const needsSignedUrl = designs.filter((d) => !d.image_url && d.storage_path);
  if (needsSignedUrl.length > 0) {
    const storage = new DesignStorage(supabase);
    const paths = needsSignedUrl.map((d) => d.storage_path as string);
    const signedByPath = await storage.createSignedUrls(paths);
    for (const d of needsSignedUrl) {
      displayUrlById.set(d.id, signedByPath.get(d.storage_path as string) ?? null);
    }
  }

  for (const d of designs) {
    if (displayUrlById.has(d.id)) continue;
    displayUrlById.set(d.id, d.image_url ?? null);
  }

  return displayUrlById;
}
