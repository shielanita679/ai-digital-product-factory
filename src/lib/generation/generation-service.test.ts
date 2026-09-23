import { describe, it, expect, vi } from "vitest";

import { deleteDesign, cleanupProjectStorage, GenerationServiceError } from "@/lib/generation/generation-service";

type Row = Record<string, unknown>;
type Db = { designs: Row[]; vectorizations: Row[]; projects: Row[]; mockups: Row[]; product_bundles: Row[]; bundle_items: Row[] };

/**
 * A minimal in-memory fake scoped to exactly the query shapes deleteDesign
 * and cleanupProjectStorage use — same approach as
 * src/lib/vector/vectorize-service.test.ts, kept separate since these two
 * functions live in a different module (generation-service.ts) with a
 * slightly different call shape (project_id-scoped lookups, no insert).
 */
function makeFakeSupabase(db: Db, removeSpy: ReturnType<typeof vi.fn>) {
  function makeBuilder(op: "select" | "delete" | "update", table: keyof Db, payload?: Row, wantCount = false) {
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
        return { data: matched, count: wantCount ? matched.length : null, error: null };
      }
      if (op === "update") {
        const matched = db[table].filter((r) => filters.every((f) => f(r)));
        matched.forEach((r) => Object.assign(r, payload));
        return { data: matched, error: null };
      }
      if (op === "delete") {
        const toDelete = db[table].filter((r) => filters.every((f) => f(r)));
        db[table] = db[table].filter((r) => !filters.every((f) => f(r)));
        // Mirror the real migration's FK `on delete cascade`: deleting a
        // design row also removes any bundle_items/mockups rows that
        // reference it, so recompute queries that run afterward see the
        // same post-cascade state the real Postgres database would.
        if (table === "designs") {
          const deletedIds = new Set(toDelete.map((r) => r.id));
          db.bundle_items = db.bundle_items.filter((r) => !deletedIds.has(r.design_id));
          db.mockups = db.mockups.filter((r) => !deletedIds.has(r.design_id));
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    return builder;
  }

  return {
    from(table: keyof Db) {
      return {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => makeBuilder("select", table, undefined, !!opts?.count),
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
      bundle_items: [],
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
      bundle_items: [],
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
      bundle_items: [],
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
        { id: "m1", bundle_id: "b1", design_id: "d1", storage_path: "u1/p1/bundles/b1/mockups/m1.png" },
        { id: "m2", bundle_id: "b1", design_id: "d1", storage_path: "u1/p1/bundles/b1/mockups/m2.png" },
      ],
      product_bundles: [],
      bundle_items: [],
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

  it("Phase 8: recomputes item_count/mockup_count on every bundle the deleted design was selected into — regression for a real live-verification bug where these counters were left stale", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = {
      designs: [
        { id: "d1", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d1/original.png" },
        { id: "d2", user_id: "u1", project_id: "p1", storage_path: "u1/p1/d2/original.png" },
      ],
      vectorizations: [],
      projects: [{ id: "p1", design_count: 2 }],
      // d1 has two mockups in bundle b1; d2 (untouched) also has one in b1,
      // so b1's real post-delete mockup_count should be 1, not 0.
      mockups: [
        { id: "m1", bundle_id: "b1", design_id: "d1", storage_path: "u1/p1/bundles/b1/mockups/m1.png", status: "completed" },
        { id: "m2", bundle_id: "b1", design_id: "d1", storage_path: "u1/p1/bundles/b1/mockups/m2.png", status: "completed" },
        { id: "m3", bundle_id: "b1", design_id: "d2", storage_path: "u1/p1/bundles/b1/mockups/m3.png", status: "completed" },
      ],
      // d1 is selected into b1 (deleted along with d1) and b2 (untouched,
      // still has its own unrelated item) — both must end up recomputed.
      bundle_items: [
        { id: "bi1", bundle_id: "b1", design_id: "d1" },
        { id: "bi2", bundle_id: "b1", design_id: "d2" },
        { id: "bi3", bundle_id: "b2", design_id: "d1" },
      ],
      product_bundles: [
        { id: "b1", item_count: 2, mockup_count: 3 },
        { id: "b2", item_count: 1, mockup_count: 0 },
      ],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await deleteDesign({ supabase, userId: "u1" }, "d1");

    const b1 = db.product_bundles.find((b) => b.id === "b1")!;
    const b2 = db.product_bundles.find((b) => b.id === "b2")!;
    expect(b1.item_count).toBe(1); // only bi2 (d2) remains
    expect(b1.mockup_count).toBe(1); // only m3 (d2) remains
    expect(b2.item_count).toBe(0); // bi3 was d1's only item in b2, now cascaded away
    expect(b2.mockup_count).toBe(0);
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
      bundle_items: [],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await cleanupProjectStorage({ supabase, userId: "u1" }, "p1");

    expect(removeSpy).toHaveBeenCalledWith(["u1/p1/d1/original.png", "u1/p1/d2/original.png", "u1/p1/d1/vector.svg"]);
  });

  it("is a no-op when the project has no stored raster or vector objects", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = { designs: [], vectorizations: [], projects: [{ id: "p1" }], mockups: [], product_bundles: [], bundle_items: [] };
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
      bundle_items: [],
    };
    const supabase = makeFakeSupabase(db, removeSpy);

    await cleanupProjectStorage({ supabase, userId: "u1" }, "p1");

    expect(removeSpy).toHaveBeenCalledWith(["u1/p1/bundles/b1/mockups/m1.png", "u1/p1/bundles/b1/cover.png"]);
  });
});
