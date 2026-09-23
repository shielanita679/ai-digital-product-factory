import { describe, it, expect, vi } from "vitest";

import { deleteDesign, cleanupProjectStorage, GenerationServiceError } from "@/lib/generation/generation-service";

type Row = Record<string, unknown>;
type Db = { designs: Row[]; vectorizations: Row[]; projects: Row[]; mockups: Row[]; product_bundles: Row[] };

/**
 * A minimal in-memory fake scoped to exactly the query shapes deleteDesign
 * and cleanupProjectStorage use — same approach as
 * src/lib/vector/vectorize-service.test.ts, kept separate since these two
 * functions live in a different module (generation-service.ts) with a
 * slightly different call shape (project_id-scoped lookups, no insert).
 */
function makeFakeSupabase(db: Db, removeSpy: ReturnType<typeof vi.fn>) {
  function makeBuilder(op: "select" | "delete" | "update", table: keyof Db, payload?: Row) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "list" | "single" | "maybeSingle" = "list";

    const builder = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      not(col: string, _op: string, val: unknown) {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      select() {
        return builder;
      },
      single() {
        mode = "single";
        return builder;
      },
      maybeSingle() {
        mode = "maybeSingle";
        return builder;
      },
      then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
        execute().then(resolve, reject);
      },
    };

    async function execute() {
      if (op === "select") {
        const matched = db[table].filter((r) => filters.every((f) => f(r)));
        if (mode === "single") {
          if (matched.length === 0) return { data: null, error: { message: "no rows" } };
          return { data: matched[0], error: null };
        }
        if (mode === "maybeSingle") return { data: matched[0] ?? null, error: null };
        return { data: matched, error: null };
      }
      if (op === "update") {
        const matched = db[table].filter((r) => filters.every((f) => f(r)));
        matched.forEach((r) => Object.assign(r, payload));
        return { data: matched, error: null };
      }
      if (op === "delete") {
        const remaining = db[table].filter((r) => !filters.every((f) => f(r)));
        db[table] = remaining;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    return builder;
  }

  return {
    from(table: keyof Db) {
      return {
        select: () => makeBuilder("select", table),
        update: (payload: Row) => makeBuilder("update", table, payload),
        delete: () => makeBuilder("delete", table),
      };
    },
    storage: {
      from: vi.fn(() => ({
        remove: removeSpy,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

describe("deleteDesign — Phase 7 vector cleanup", () => {
  it("deletes both the raster and vector Storage objects, then the design row", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = {
      designs: [{ id: "d1", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d1/original.png" }],
      vectorizations: [{ id: "v1", design_id: "d1", storage_path: "u1/p1/d1/vector.svg" }],
      projects: [{ id: "p1", design_count: 1 }],
      mockups: [],
      product_bundles: [],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await deleteDesign({ supabase, userId: "u1" }, "d1");

    expect(removeSpy).toHaveBeenCalledWith(["u1/p1/d1/original.png", "u1/p1/d1/vector.svg"]);
    expect(db.designs).toHaveLength(0);
  });

  it("still works when there is no vectorization row at all (pre-Phase-7 / never vectorized)", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = {
      designs: [{ id: "d1", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d1/original.png" }],
      vectorizations: [],
      projects: [{ id: "p1", design_count: 1 }],
      mockups: [],
      product_bundles: [],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await deleteDesign({ supabase, userId: "u1" }, "d1");

    expect(removeSpy).toHaveBeenCalledWith(["u1/p1/d1/original.png"]);
    expect(db.designs).toHaveLength(0);
  });

  it("keeps the design row intact if the vector Storage object fails to delete", async () => {
    const removeSpy = vi.fn(async () => ({ data: [], error: null })); // simulates a silent RLS no-op, like the Phase 6 bug this pattern guards against
    const db: Db = {
      designs: [{ id: "d1", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d1/original.png" }],
      vectorizations: [{ id: "v1", design_id: "d1", storage_path: "u1/p1/d1/vector.svg" }],
      projects: [{ id: "p1", design_count: 1 }],
      mockups: [],
      product_bundles: [],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await expect(deleteDesign({ supabase, userId: "u1" }, "d1")).rejects.toBeInstanceOf(GenerationServiceError);
    expect(db.designs).toHaveLength(1);
  });

  it("Phase 8: also deletes any mockup Storage objects generated from this design", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = {
      designs: [{ id: "d1", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d1/original.png" }],
      vectorizations: [],
      projects: [{ id: "p1", design_count: 1 }],
      mockups: [
        { id: "m1", design_id: "d1", storage_path: "u1/p1/bundles/b1/mockups/m1.png" },
        { id: "m2", design_id: "d1", storage_path: "u1/p1/bundles/b1/mockups/m2.png" },
      ],
      product_bundles: [],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await deleteDesign({ supabase, userId: "u1" }, "d1");

    expect(removeSpy).toHaveBeenCalledWith([
      "u1/p1/d1/original.png",
      "u1/p1/bundles/b1/mockups/m1.png",
      "u1/p1/bundles/b1/mockups/m2.png",
    ]);
    expect(db.designs).toHaveLength(0);
  });
});

describe("cleanupProjectStorage — Phase 7 vector cleanup", () => {
  it("deletes both raster and vector Storage objects across the whole project", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = {
      designs: [
        { id: "d1", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d1/original.png" },
        { id: "d2", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d2/original.png" },
      ],
      vectorizations: [{ id: "v1", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d1/vector.svg" }],
      projects: [{ id: "p1" }],
      mockups: [],
      product_bundles: [],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await cleanupProjectStorage({ supabase, userId: "u1" }, "p1");

    expect(removeSpy).toHaveBeenCalledWith(["u1/p1/d1/original.png", "u1/p1/d2/original.png", "u1/p1/d1/vector.svg"]);
  });

  it("is a no-op when the project has no stored raster or vector objects", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = { designs: [], vectorizations: [], projects: [{ id: "p1" }], mockups: [], product_bundles: [] };
    const supabase = makeFakeSupabase(db, removeSpy);

    await cleanupProjectStorage({ supabase, userId: "u1" }, "p1");

    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("Phase 8: also deletes mockup Storage objects and bundle cover Storage objects across the whole project", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = {
      designs: [],
      vectorizations: [],
      projects: [{ id: "p1" }],
      mockups: [{ id: "m1", user_id: "u1", project_id: "p1", storage_path: "u1/p1/bundles/b1/mockups/m1.png" }],
      product_bundles: [{ id: "b1", user_id: "u1", project_id: "p1", cover_storage_path: "u1/p1/bundles/b1/cover.png" }],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await cleanupProjectStorage({ supabase, userId: "u1" }, "p1");

    expect(removeSpy).toHaveBeenCalledWith(["u1/p1/bundles/b1/mockups/m1.png", "u1/p1/bundles/b1/cover.png"]);
  });
});
