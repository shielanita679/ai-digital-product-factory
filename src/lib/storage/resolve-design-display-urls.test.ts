import { describe, it, expect, vi } from "vitest";

import { resolveDesignDisplayUrls } from "@/lib/storage/resolve-design-display-urls";
import type { Design } from "@/types/supabase";

type MinimalDesign = Pick<Design, "id" | "image_url" | "storage_path">;

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

describe("resolveDesignDisplayUrls", () => {
  it("a mock design (image_url set, no storage_path) resolves directly to its data: URI, no Storage call needed", async () => {
    const supabase = makeFakeSupabase();
    const designs: MinimalDesign[] = [{ id: "d1", image_url: "data:image/svg+xml;base64,AAAA", storage_path: null }];

    const result = await resolveDesignDisplayUrls(supabase, designs);

    expect(result.get("d1")).toBe("data:image/svg+xml;base64,AAAA");
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("a real design (storage_path set, no image_url) resolves to a freshly generated signed URL", async () => {
    const supabase = makeFakeSupabase({ "u1/p1/d2/original.png": "https://signed.example/d2" });
    const designs: MinimalDesign[] = [{ id: "d2", image_url: null, storage_path: "u1/p1/d2/original.png" }];

    const result = await resolveDesignDisplayUrls(supabase, designs);

    expect(result.get("d2")).toBe("https://signed.example/d2");
    expect(supabase.storage.from).toHaveBeenCalled();
  });

  it("a real design whose signed-URL generation fails resolves to null (rendered as 'Image unavailable', not a broken link)", async () => {
    const supabase = makeFakeSupabase({}); // no entry configured -> signing "fails"
    const designs: MinimalDesign[] = [{ id: "d3", image_url: null, storage_path: "u1/p1/d3/original.png" }];

    const result = await resolveDesignDisplayUrls(supabase, designs);

    expect(result.get("d3")).toBeNull();
  });

  it("a design with neither image_url nor storage_path (e.g. still pending/failed) resolves to null", async () => {
    const supabase = makeFakeSupabase();
    const designs: MinimalDesign[] = [{ id: "d4", image_url: null, storage_path: null }];

    const result = await resolveDesignDisplayUrls(supabase, designs);

    expect(result.get("d4")).toBeNull();
  });

  it("batches all real designs into a single createSignedUrls call, not one call per design", async () => {
    const supabase = makeFakeSupabase({
      "u1/p1/a/original.png": "https://signed.example/a",
      "u1/p1/b/original.png": "https://signed.example/b",
    });
    const designs: MinimalDesign[] = [
      { id: "a", image_url: null, storage_path: "u1/p1/a/original.png" },
      { id: "b", image_url: null, storage_path: "u1/p1/b/original.png" },
    ];

    await resolveDesignDisplayUrls(supabase, designs);

    expect(supabase.storage.from).toHaveBeenCalledTimes(1);
  });

  it("handles a mixed batch of mock and real designs correctly in one call", async () => {
    const supabase = makeFakeSupabase({ "u1/p1/real/original.png": "https://signed.example/real" });
    const designs: MinimalDesign[] = [
      { id: "mock1", image_url: "data:image/svg+xml;base64,BBBB", storage_path: null },
      { id: "real1", image_url: null, storage_path: "u1/p1/real/original.png" },
    ];

    const result = await resolveDesignDisplayUrls(supabase, designs);

    expect(result.get("mock1")).toBe("data:image/svg+xml;base64,BBBB");
    expect(result.get("real1")).toBe("https://signed.example/real");
  });
});
