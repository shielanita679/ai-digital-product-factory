import { describe, it, expect, vi } from "vitest";

import { resolveVectorDisplayUrls } from "@/lib/storage/resolve-vector-display-urls";
import type { Vectorization } from "@/types/supabase";

type MinimalVectorization = Pick<Vectorization, "id" | "storage_path" | "status">;

function makeFakeSupabase(signedUrlsByPath: Record<string, string> = {}) {
  return {
    storage: {
      from: vi.fn(() => ({
        createSignedUrls: vi.fn(async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: signedUrlsByPath[p] ?? null, error: signedUrlsByPath[p] ? null : { message: "not found" } })),
          error: null,
        })),
      })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

describe("resolveVectorDisplayUrls", () => {
  it("resolves a completed vectorization to a freshly generated signed URL", async () => {
    const supabase = makeFakeSupabase({ "u1/p1/d1/vector.svg": "https://signed.example/v1" });
    const rows: MinimalVectorization[] = [{ id: "v1", status: "completed", storage_path: "u1/p1/d1/vector.svg" }];

    const result = await resolveVectorDisplayUrls(supabase, rows);

    expect(result.get("v1")).toBe("https://signed.example/v1");
  });

  it("skips non-completed vectorizations entirely — no Storage call made for them", async () => {
    const supabase = makeFakeSupabase();
    const rows: MinimalVectorization[] = [
      { id: "v1", status: "processing", storage_path: null },
      { id: "v2", status: "failed", storage_path: null },
    ];

    const result = await resolveVectorDisplayUrls(supabase, rows);

    expect(result.size).toBe(0);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("returns an empty map without calling Storage when there's nothing to resolve", async () => {
    const supabase = makeFakeSupabase();
    const result = await resolveVectorDisplayUrls(supabase, []);
    expect(result.size).toBe(0);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("a completed vectorization whose signing fails resolves to null", async () => {
    const supabase = makeFakeSupabase({});
    const rows: MinimalVectorization[] = [{ id: "v1", status: "completed", storage_path: "u1/p1/d1/vector.svg" }];

    const result = await resolveVectorDisplayUrls(supabase, rows);

    expect(result.get("v1")).toBeNull();
  });
});
