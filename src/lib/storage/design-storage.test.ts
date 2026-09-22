import { describe, it, expect, vi } from "vitest";

import { DesignStorage, buildDesignObjectPath, GENERATED_DESIGNS_BUCKET } from "@/lib/storage/design-storage";

describe("buildDesignObjectPath", () => {
  it("builds an ownership-prefixed path from server-derived ids only", () => {
    const path = buildDesignObjectPath("user-1", "project-1", "design-1", "image/png");
    expect(path).toBe("user-1/project-1/design-1/original.png");
  });

  it("the first path segment is exactly the user id — what the Storage RLS policy checks against auth.uid()", () => {
    const path = buildDesignObjectPath("11111111-1111-1111-1111-111111111111", "p", "d", "image/png");
    expect(path.split("/")[0]).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("maps known MIME types to the correct extension", () => {
    expect(buildDesignObjectPath("u", "p", "d", "image/png")).toMatch(/\.png$/);
    expect(buildDesignObjectPath("u", "p", "d", "image/jpeg")).toMatch(/\.jpg$/);
    expect(buildDesignObjectPath("u", "p", "d", "image/webp")).toMatch(/\.webp$/);
  });

  it("falls back to a safe generic extension for an unrecognized MIME type rather than guessing", () => {
    expect(buildDesignObjectPath("u", "p", "d", "application/octet-stream")).toMatch(/\.bin$/);
  });

  it("is unaffected by path-traversal-shaped input in the mime type field (only ever a controlled constant in practice)", () => {
    const path = buildDesignObjectPath("u", "p", "d", "../../../etc/passwd");
    // Falls back to the generic extension — never interpolates the mime
    // type as a path segment of its own.
    expect(path).toBe("u/p/d/original.bin");
    expect(path.split("/")).toHaveLength(4);
  });
});

function makeFakeSupabase(overrides: Record<string, unknown> = {}) {
  return {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed.example/x" }, error: null })),
        createSignedUrls: vi.fn(async (paths: string[]) => ({
          data: paths.map((p) => ({ path: p, signedUrl: `https://signed.example/${p}`, error: null })),
          error: null,
        })),
        remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
        ...overrides,
      })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

describe("DesignStorage", () => {
  it("upload() writes to the correct ownership-prefixed path and reports the byte size", async () => {
    const supabase = makeFakeSupabase();
    const storage = new DesignStorage(supabase);
    const bytes = Buffer.from("fake-image-bytes");

    const result = await storage.upload({ userId: "u1", projectId: "p1", designId: "d1", bytes, mimeType: "image/png" });

    expect(supabase.storage.from).toHaveBeenCalledWith(GENERATED_DESIGNS_BUCKET);
    expect(result.bucket).toBe(GENERATED_DESIGNS_BUCKET);
    expect(result.path).toBe("u1/p1/d1/original.png");
    expect(result.sizeBytes).toBe(bytes.byteLength);
  });

  it("upload() throws a DesignStorageError (not a raw Supabase error) on failure", async () => {
    const supabase = makeFakeSupabase({ upload: vi.fn(async () => ({ data: null, error: { message: "bucket missing" } })) });
    const storage = new DesignStorage(supabase);
    await expect(
      storage.upload({ userId: "u1", projectId: "p1", designId: "d1", bytes: Buffer.from("x"), mimeType: "image/png" }),
    ).rejects.toThrow(/could not upload/i);
  });

  it("createSignedUrl() with a filename requests a download-disposition signed URL — a plain <a download> is silently ignored by browsers for cross-origin Storage URLs, found via live download testing", async () => {
    const createSignedUrlSpy = vi.fn(async () => ({ data: { signedUrl: "https://signed.example/x" }, error: null }));
    const supabase = makeFakeSupabase({ createSignedUrl: createSignedUrlSpy });
    const storage = new DesignStorage(supabase);

    await storage.createSignedUrl("u1/p1/d1/original.png", 300, "my-design.png");
    expect(createSignedUrlSpy).toHaveBeenCalledWith("u1/p1/d1/original.png", 300, { download: "my-design.png" });

    await storage.createSignedUrl("u1/p1/d1/original.png", 300);
    expect(createSignedUrlSpy).toHaveBeenLastCalledWith("u1/p1/d1/original.png", 300, undefined);
  });

  it("createSignedUrl() returns null instead of throwing when the object is unavailable", async () => {
    const supabase = makeFakeSupabase({ createSignedUrl: vi.fn(async () => ({ data: null, error: { message: "not found" } })) });
    const storage = new DesignStorage(supabase);
    const url = await storage.createSignedUrl("u1/p1/d1/original.png");
    expect(url).toBeNull();
  });

  it("createSignedUrls() batches a request for multiple paths and returns a path->url map", async () => {
    const supabase = makeFakeSupabase();
    const storage = new DesignStorage(supabase);
    const map = await storage.createSignedUrls(["a/b/c/original.png", "a/b/d/original.png"]);
    expect(map.get("a/b/c/original.png")).toBe("https://signed.example/a/b/c/original.png");
    expect(map.size).toBe(2);
  });

  it("createSignedUrls() returns an empty map for an empty input without calling Storage", async () => {
    const supabase = makeFakeSupabase();
    const storage = new DesignStorage(supabase);
    const map = await storage.createSignedUrls([]);
    expect(map.size).toBe(0);
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it("delete() returns { ok: false } rather than throwing, so callers can decide how to handle it", async () => {
    const supabase = makeFakeSupabase({ remove: vi.fn(async () => ({ data: null, error: { message: "denied" } })) });
    const storage = new DesignStorage(supabase);
    const result = await storage.delete("u1/p1/d1/original.png");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("delete() returns { ok: false } when Storage RLS silently permits the call but removes nothing (error: null, empty data) — a real bug found via live cross-user delete testing", async () => {
    // This is exactly what Supabase Storage's remove() returns when RLS
    // blocks the delete without raising an explicit error: no `error`,
    // but an empty `data` array. A bare `if (error)` check would
    // incorrectly report success for a delete that never happened.
    const supabase = makeFakeSupabase({ remove: vi.fn(async () => ({ data: [], error: null })) });
    const storage = new DesignStorage(supabase);
    const result = await storage.delete("someone-elses/p1/d1/original.png");
    expect(result.ok).toBe(false);
  });

  it("deleteMany() reports which paths failed rather than an all-or-nothing result", async () => {
    const supabase = makeFakeSupabase({
      remove: vi.fn(async (paths: string[]) => ({ data: [{ name: paths[0] }], error: null })), // only the first "succeeded"
    });
    const storage = new DesignStorage(supabase);
    const result = await storage.deleteMany(["a", "b"]);
    expect(result.ok).toBe(false);
    expect(result.failedPaths).toEqual(["b"]);
  });
});
