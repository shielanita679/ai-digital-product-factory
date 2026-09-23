import { describe, it, expect, vi } from "vitest";

import { MockupStorage, buildMockupObjectPath, buildBundleCoverObjectPath, BUNDLES_BUCKET } from "@/lib/storage/mockup-storage";
import { GENERATED_DESIGNS_BUCKET } from "@/lib/storage/design-storage";

describe("path builders", () => {
  it("reuses the same bucket as designs/vectors — no new bucket introduced", () => {
    expect(BUNDLES_BUCKET).toBe(GENERATED_DESIGNS_BUCKET);
  });

  it("buildMockupObjectPath follows {user}/{project}/bundles/{bundle}/mockups/{mockup}.png", () => {
    expect(buildMockupObjectPath("u1", "p1", "b1", "m1")).toBe("u1/p1/bundles/b1/mockups/m1.png");
  });

  it("buildBundleCoverObjectPath follows {user}/{project}/bundles/{bundle}/cover.png", () => {
    expect(buildBundleCoverObjectPath("u1", "p1", "b1")).toBe("u1/p1/bundles/b1/cover.png");
  });

  it("the first path segment is exactly the user id — what the Storage RLS policy checks against auth.uid()", () => {
    const mockupPath = buildMockupObjectPath("11111111-1111-1111-1111-111111111111", "p", "b", "m");
    const coverPath = buildBundleCoverObjectPath("11111111-1111-1111-1111-111111111111", "p", "b");
    expect(mockupPath.split("/")[0]).toBe("11111111-1111-1111-1111-111111111111");
    expect(coverPath.split("/")[0]).toBe("11111111-1111-1111-1111-111111111111");
  });
});

function makeFakeSupabase(overrides: Record<string, unknown> = {}) {
  return {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
        download: vi.fn(async () => ({ data: { arrayBuffer: async () => new TextEncoder().encode("fake-bytes").buffer }, error: null })),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed.example/x" }, error: null })),
        createSignedUrls: vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}`, error: null })), error: null })),
        remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
        ...overrides,
      })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

describe("MockupStorage", () => {
  it("uploadMockup() writes to the canonical mockup path", async () => {
    const supabase = makeFakeSupabase();
    const storage = new MockupStorage(supabase);
    const result = await storage.uploadMockup({ userId: "u1", projectId: "p1", bundleId: "b1", mockupId: "m1", bytes: Buffer.from("png-bytes") });
    expect(result.bucket).toBe(BUNDLES_BUCKET);
    expect(result.path).toBe("u1/p1/bundles/b1/mockups/m1.png");
  });

  it("uploadCover() writes to the canonical cover path", async () => {
    const supabase = makeFakeSupabase();
    const storage = new MockupStorage(supabase);
    const result = await storage.uploadCover({ userId: "u1", projectId: "p1", bundleId: "b1", bytes: Buffer.from("png-bytes") });
    expect(result.path).toBe("u1/p1/bundles/b1/cover.png");
  });

  it("delete() returns { ok: false } when Storage silently removes nothing (same RLS-no-op guard as DesignStorage)", async () => {
    const supabase = makeFakeSupabase({ remove: vi.fn(async () => ({ data: [], error: null })) });
    const storage = new MockupStorage(supabase);
    const result = await storage.delete("someone-elses/mockup.png");
    expect(result.ok).toBe(false);
  });

  it("deleteMany() reports which paths failed", async () => {
    const supabase = makeFakeSupabase({ remove: vi.fn(async (paths: string[]) => ({ data: [{ name: paths[0] }], error: null })) });
    const storage = new MockupStorage(supabase);
    const result = await storage.deleteMany(["a", "b"]);
    expect(result.ok).toBe(false);
    expect(result.failedPaths).toEqual(["b"]);
  });

  it("createSignedUrls() batches multiple paths into one call", async () => {
    const supabase = makeFakeSupabase();
    const storage = new MockupStorage(supabase);
    const map = await storage.createSignedUrls(["a/cover.png", "a/mockups/m1.png"]);
    expect(map.size).toBe(2);
    expect(supabase.storage.from).toHaveBeenCalledTimes(1);
  });
});
