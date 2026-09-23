import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createBundle,
  renameBundle,
  setBundleItem,
  removeBundleItem,
  deleteBundle,
  generateBundleCover,
  getDesignFormatEligibility,
  BundleServiceError,
} from "@/lib/bundles/bundle-service";

type Row = Record<string, unknown>;
type Db = { projects: Row[]; designs: Row[]; vectorizations: Row[]; product_bundles: Row[]; bundle_items: Row[]; mockups: Row[]; product_packages?: Row[] };

let idCounter = 0;
function genId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

/** Same in-memory fake-Supabase approach as vectorize-service.test.ts, extended with a minimal `designs(title)` embed for bundle_items (only what generateBundleCover actually needs). */
function makeFakeSupabase(db: Db, storageOverrides: Record<string, unknown> = {}) {
  // Phase 10: deleteBundle also queries product_packages — defaulted here
  // so every pre-Phase-10 test fixture above doesn't need to list it.
  db.product_packages = db.product_packages ?? [];
  function makeBuilder(op: "select" | "insert" | "update" | "delete" | "upsert", table: keyof Db, payload?: Row, selectCols?: string, countOnly = false) {
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
      order() {
        return builder;
      },
      select(cols?: string) {
        selectCols = cols;
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
      db[table] = db[table] ?? []; // Phase 10: product_packages is optional on Db so pre-Phase-10 fixtures don't need updating.
      if (op === "select") {
        let matched = db[table].filter((r) => filters.every((f) => f(r)));
        if (countOnly) return { data: null, error: null, count: matched.length };

        if (table === "bundle_items" && selectCols?.includes("designs(title)")) {
          matched = matched.map((r) => ({
            ...r,
            designs: db.designs.find((d) => d.id === r.design_id) ? { title: db.designs.find((d) => d.id === r.design_id)!.title } : null,
          }));
        }

        if (mode === "single") {
          if (matched.length === 0) return { data: null, error: { message: "no rows", code: "PGRST116" } };
          return { data: matched[0], error: null };
        }
        if (mode === "maybeSingle") return { data: matched[0] ?? null, error: null };
        return { data: matched, error: null };
      }
      if (op === "insert") {
        const row: Row = { id: genId(String(table)), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        if (table === "product_bundles") {
          Object.assign(row, { status: row.status ?? "draft", item_count: 0, mockup_count: 0 });
        }
        db[table].push(row);
        return { data: row, error: null };
      }
      if (op === "upsert") {
        const conflictKeys = ["bundle_id", "design_id"];
        const existing = db[table].find((r) => conflictKeys.every((k) => r[k] === (payload as Row)[k]));
        if (existing) {
          Object.assign(existing, payload, { updated_at: new Date().toISOString() });
          return { data: existing, error: null };
        }
        const row: Row = { id: genId(String(table)), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        db[table].push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        const matched = db[table].filter((r) => filters.every((f) => f(r)));
        matched.forEach((r) => Object.assign(r, payload, { updated_at: new Date().toISOString() }));
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
        select: (cols?: string, opts?: { count?: string; head?: boolean }) => makeBuilder("select", table, undefined, cols, !!opts?.head),
        insert: (payload: Row) => makeBuilder("insert", table, payload),
        upsert: (payload: Row) => makeBuilder("upsert", table, payload), // onConflict is a no-op here: the fake always matches on the unique key implicitly
        update: (payload: Row) => makeBuilder("update", table, payload),
        delete: () => makeBuilder("delete", table),
      };
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
        remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
        ...storageOverrides,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

function makeCompletedDesign(overrides: Row = {}): Row {
  return {
    id: genId("design"),
    user_id: "user-1",
    project_id: "project-1",
    status: "completed",
    storage_path: "user-1/project-1/design-1/original.png",
    title: "My Design",
    ...overrides,
  };
}

describe("getDesignFormatEligibility", () => {
  it("PNG requires status=completed AND a real storage_path — a mock design (no storage_path) is never PNG-eligible", () => {
    expect(getDesignFormatEligibility({ status: "completed", storage_path: "x" }, null)).toMatchObject({ pngEligible: true });
    expect(getDesignFormatEligibility({ status: "completed", storage_path: null }, null)).toMatchObject({ pngEligible: false });
    expect(getDesignFormatEligibility({ status: "pending", storage_path: "x" }, null)).toMatchObject({ pngEligible: false });
  });

  it("SVG requires a completed vectorization", () => {
    expect(getDesignFormatEligibility({ status: "completed", storage_path: "x" }, { status: "completed" })).toMatchObject({ svgEligible: true });
    expect(getDesignFormatEligibility({ status: "completed", storage_path: "x" }, { status: "processing" })).toMatchObject({ svgEligible: false });
    expect(getDesignFormatEligibility({ status: "completed", storage_path: "x" }, null)).toMatchObject({ svgEligible: false });
  });
});

describe("createBundle / renameBundle", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("creates a bundle owned by the caller, scoped to their own project", async () => {
    const db: Db = { projects: [{ id: "project-1", user_id: "user-1" }], designs: [], vectorizations: [], product_bundles: [], bundle_items: [], mockups: [] };
    const supabase = makeFakeSupabase(db);
    const result = await createBundle({ supabase, userId: "user-1" }, "project-1", "My Bundle");
    expect(db.product_bundles).toHaveLength(1);
    expect(db.product_bundles[0].id).toBe(result.bundleId);
    expect(db.product_bundles[0].status).toBe("draft");
  });

  it("rejects creating a bundle in a project owned by a different user", async () => {
    const db: Db = { projects: [{ id: "project-1", user_id: "user-B" }], designs: [], vectorizations: [], product_bundles: [], bundle_items: [], mockups: [] };
    const supabase = makeFakeSupabase(db);
    await expect(createBundle({ supabase, userId: "user-A" }, "project-1", "My Bundle")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects an empty/whitespace-only name", async () => {
    const db: Db = { projects: [{ id: "project-1", user_id: "user-1" }], designs: [], vectorizations: [], product_bundles: [], bundle_items: [], mockups: [] };
    const supabase = makeFakeSupabase(db);
    await expect(createBundle({ supabase, userId: "user-1" }, "project-1", "   ")).rejects.toMatchObject({ code: "invalid_config" });
  });

  it("renames only the caller's own bundle", async () => {
    const db: Db = { projects: [], designs: [], vectorizations: [], product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1", name: "Old" }], bundle_items: [], mockups: [] };
    const supabase = makeFakeSupabase(db);
    await renameBundle({ supabase, userId: "user-1" }, "bundle-1", "New Name");
    expect(db.product_bundles[0].name).toBe("New Name");
  });
});

describe("setBundleItem / removeBundleItem", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("adds an eligible design with the requested formats and updates item_count", async () => {
    const design = makeCompletedDesign();
    const db: Db = {
      projects: [], designs: [design], vectorizations: [{ design_id: design.id, user_id: "user-1", status: "completed" }],
      product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1" }], bundle_items: [], mockups: [],
    };
    const supabase = makeFakeSupabase(db);
    await setBundleItem({ supabase, userId: "user-1" }, "bundle-1", design.id as string, { includePng: true, includeSvg: true });

    expect(db.bundle_items).toHaveLength(1);
    expect(db.bundle_items[0]).toMatchObject({ include_png: true, include_svg: true });
    expect(db.product_bundles[0].item_count).toBe(1);
  });

  it("rejects requesting PNG for a design with no real stored raster", async () => {
    const design = makeCompletedDesign({ storage_path: null });
    const db: Db = { projects: [], designs: [design], vectorizations: [], product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1" }], bundle_items: [], mockups: [] };
    const supabase = makeFakeSupabase(db);
    await expect(setBundleItem({ supabase, userId: "user-1" }, "bundle-1", design.id as string, { includePng: true, includeSvg: false })).rejects.toMatchObject({
      code: "png_not_eligible",
    });
  });

  it("rejects requesting SVG when there's no completed vectorization", async () => {
    const design = makeCompletedDesign();
    const db: Db = { projects: [], designs: [design], vectorizations: [], product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1" }], bundle_items: [], mockups: [] };
    const supabase = makeFakeSupabase(db);
    await expect(setBundleItem({ supabase, userId: "user-1" }, "bundle-1", design.id as string, { includePng: true, includeSvg: true })).rejects.toMatchObject({
      code: "svg_not_eligible",
    });
  });

  it("rejects a design that doesn't belong to the bundle's own project", async () => {
    const design = makeCompletedDesign({ project_id: "other-project" });
    const db: Db = { projects: [], designs: [design], vectorizations: [], product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1" }], bundle_items: [], mockups: [] };
    const supabase = makeFakeSupabase(db);
    await expect(setBundleItem({ supabase, userId: "user-1" }, "bundle-1", design.id as string, { includePng: true, includeSvg: false })).rejects.toMatchObject({
      code: "invalid_config",
    });
  });

  it("rejects a design owned by a different user, even if it happens to share a project id", async () => {
    const design = makeCompletedDesign({ user_id: "user-B" });
    const db: Db = { projects: [], designs: [design], vectorizations: [], product_bundles: [{ id: "bundle-1", user_id: "user-A", project_id: "project-1" }], bundle_items: [], mockups: [] };
    const supabase = makeFakeSupabase(db);
    await expect(setBundleItem({ supabase, userId: "user-A" }, "bundle-1", design.id as string, { includePng: true, includeSvg: false })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("removing a design decrements item_count back down", async () => {
    const design = makeCompletedDesign();
    const db: Db = {
      projects: [], designs: [design], vectorizations: [],
      product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1", item_count: 1 }],
      bundle_items: [{ id: "item-1", bundle_id: "bundle-1", design_id: design.id, user_id: "user-1", include_png: true, include_svg: false }],
      mockups: [],
    };
    const supabase = makeFakeSupabase(db);
    await removeBundleItem({ supabase, userId: "user-1" }, "bundle-1", design.id as string);
    expect(db.bundle_items).toHaveLength(0);
    expect(db.product_bundles[0].item_count).toBe(0);
  });
});

describe("generateBundleCover", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("generates and stores a cover, updating the bundle row with its storage identity", async () => {
    const design = makeCompletedDesign({ title: "Cute Cat" });
    const db: Db = {
      projects: [], designs: [design], vectorizations: [],
      product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1", name: "My Bundle" }],
      bundle_items: [{ id: "item-1", bundle_id: "bundle-1", design_id: design.id, user_id: "user-1", include_png: true, include_svg: false }],
      mockups: [],
    };
    const supabase = makeFakeSupabase(db);
    await generateBundleCover({ supabase, userId: "user-1" }, "bundle-1");

    expect(db.product_bundles[0].cover_storage_bucket).toBe("generated-designs");
    expect(db.product_bundles[0].cover_storage_path).toMatch(/cover\.png$/);
  });
});

describe("deleteBundle", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("deletes cover + all mockup Storage objects before the bundle row (storage-first)", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = {
      projects: [], designs: [], vectorizations: [],
      product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1", cover_storage_path: "user-1/project-1/bundles/bundle-1/cover.png" }],
      bundle_items: [],
      mockups: [{ id: "mockup-1", bundle_id: "bundle-1", user_id: "user-1", storage_path: "user-1/project-1/bundles/bundle-1/mockups/mockup-1.png" }],
    };
    const supabase = makeFakeSupabase(db, { remove: removeSpy });

    await deleteBundle({ supabase, userId: "user-1" }, "bundle-1");

    expect(removeSpy).toHaveBeenCalledWith([
      "user-1/project-1/bundles/bundle-1/cover.png",
      "user-1/project-1/bundles/bundle-1/mockups/mockup-1.png",
    ]);
    expect(db.product_bundles).toHaveLength(0);
  });

  it("keeps the bundle row intact if Storage cleanup fails", async () => {
    const db: Db = {
      projects: [], designs: [], vectorizations: [],
      product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1", cover_storage_path: "some/path/cover.png" }],
      bundle_items: [], mockups: [],
    };
    const supabase = makeFakeSupabase(db, { remove: vi.fn(async () => ({ data: [], error: null })) });
    await expect(deleteBundle({ supabase, userId: "user-1" }, "bundle-1")).rejects.toBeInstanceOf(BundleServiceError);
    expect(db.product_bundles).toHaveLength(1);
  });

  it("Phase 10: also deletes any built package ZIP(s) before the bundle row — DB cascade alone would orphan the Storage object", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = {
      projects: [],
      designs: [],
      vectorizations: [],
      product_bundles: [{ id: "bundle-1", user_id: "user-1", project_id: "project-1", cover_storage_path: null }],
      bundle_items: [],
      mockups: [],
      product_packages: [
        { id: "pkg-generic", bundle_id: "bundle-1", user_id: "user-1", storage_path: "user-1/project-1/bundles/bundle-1/package/generic.zip" },
        { id: "pkg-etsy", bundle_id: "bundle-1", user_id: "user-1", storage_path: "user-1/project-1/bundles/bundle-1/package/etsy.zip" },
        { id: "pkg-never-built", bundle_id: "bundle-1", user_id: "user-1", storage_path: null },
      ],
    };
    const supabase = makeFakeSupabase(db, { remove: removeSpy });

    await deleteBundle({ supabase, userId: "user-1" }, "bundle-1");

    expect(removeSpy).toHaveBeenCalledWith([
      "user-1/project-1/bundles/bundle-1/package/generic.zip",
      "user-1/project-1/bundles/bundle-1/package/etsy.zip",
    ]);
    expect(db.product_bundles).toHaveLength(0);
  });
});
