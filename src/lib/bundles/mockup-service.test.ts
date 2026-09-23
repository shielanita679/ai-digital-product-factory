import { describe, it, expect, vi, beforeEach } from "vitest";

import { generateMockups, deleteMockup, getMockupDownloadUrl, MockupServiceError } from "@/lib/bundles/mockup-service";
import type { MockupProvider, MockupResult } from "@/lib/mockups/mockup-provider";

type Row = Record<string, unknown>;
type Db = { designs: Row[]; product_bundles: Row[]; mockups: Row[] };

let idCounter = 0;
function genId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function makeFakeSupabase(db: Db, storageOverrides: Record<string, unknown> = {}) {
  function makeBuilder(op: "select" | "insert" | "update" | "delete", table: keyof Db, payload?: Row, countOnly = false) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "list" | "single" | "maybeSingle" = "list";

    const builder = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) countOnly = true;
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
        if (countOnly) return { data: null, error: null, count: matched.length };
        if (mode === "single") {
          if (matched.length === 0) return { data: null, error: { message: "no rows" } };
          return { data: matched[0], error: null };
        }
        if (mode === "maybeSingle") return { data: matched[0] ?? null, error: null };
        return { data: matched, error: null };
      }
      if (op === "insert") {
        const row: Row = { id: genId(String(table)), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        if (table === "mockups" && db.mockups.some((r) => r.bundle_id === row.bundle_id && r.design_id === row.design_id && r.template_type === row.template_type)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        db[table].push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        const matched = db[table].filter((r) => filters.every((f) => f(r)));
        matched.forEach((r) => Object.assign(r, payload, { updated_at: new Date().toISOString() }));
        return { data: matched, error: null };
      }
      if (op === "delete") {
        db[table] = db[table].filter((r) => !filters.every((f) => f(r)));
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    return builder;
  }

  return {
    from(table: keyof Db) {
      return {
        select: (cols?: string, opts?: { count?: string; head?: boolean }) => makeBuilder("select", table, undefined, !!opts?.head),
        insert: (payload: Row) => makeBuilder("insert", table, payload),
        update: (payload: Row) => makeBuilder("update", table, payload),
        delete: () => makeBuilder("delete", table),
      };
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed.example/mockup.png" }, error: null })),
        remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
        ...storageOverrides,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double
  } as any;
}

const REAL_PNG_1x1_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
function realPngBytes() {
  return Buffer.from(REAL_PNG_1x1_BASE64, "base64");
}

function makeStubProvider(resultFor: (template: string) => MockupResult): MockupProvider {
  return {
    name: "stub",
    capabilities: { supportedTemplates: ["tshirt", "mug"], isDeterministic: true, usesSourceImagery: false },
    generate: vi.fn(async (input) => resultFor(input.templateType)),
  };
}

function makeBundleAndDesign(db: Db, overrides: Row = {}) {
  const design = { id: genId("design"), user_id: "user-1", project_id: "project-1", status: "completed", storage_path: "x", title: "D", metadata: {}, ...overrides };
  const bundle = { id: genId("bundle"), user_id: "user-1", project_id: "project-1" };
  db.designs.push(design);
  db.product_bundles.push(bundle);
  return { design, bundle };
}

describe("generateMockups", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("generates a completed mockup row with correct storage identity", async () => {
    const db: Db = { designs: [], product_bundles: [], mockups: [] };
    const { design, bundle } = makeBundleAndDesign(db);
    const supabase = makeFakeSupabase(db);
    const provider = makeStubProvider(() => ({ ok: true, bytes: realPngBytes(), mimeType: "image/png", width: 800, height: 800, providerName: "stub", providerMockupId: "x" }));

    const result = await generateMockups({ supabase, userId: "user-1" }, bundle.id as string, design.id as string, ["tshirt"], { providerOverride: provider });

    expect(result.results).toEqual([{ templateType: "tshirt", status: "completed" }]);
    expect(db.mockups).toHaveLength(1);
    expect(db.mockups[0].status).toBe("completed");
    expect(db.mockups[0].storage_path).toMatch(/mockups\/.*\.png$/);
  });

  it("rejects generating mockups for a design that isn't a completed, real stored raster", async () => {
    const db: Db = { designs: [], product_bundles: [], mockups: [] };
    const { design, bundle } = makeBundleAndDesign(db, { status: "pending", storage_path: null });
    const supabase = makeFakeSupabase(db);
    await expect(generateMockups({ supabase, userId: "user-1" }, bundle.id as string, design.id as string, ["tshirt"])).rejects.toMatchObject({ code: "unsupported_design" });
  });

  it("one failed template does not corrupt a successful one in the same batch (partial failure isolation)", async () => {
    const db: Db = { designs: [], product_bundles: [], mockups: [] };
    const { design, bundle } = makeBundleAndDesign(db);
    const supabase = makeFakeSupabase(db);
    const provider = makeStubProvider((template) =>
      template === "mug" ? { ok: false, errorMessage: "Simulated failure." } : { ok: true, bytes: realPngBytes(), mimeType: "image/png", width: 800, height: 800, providerName: "stub", providerMockupId: "x" },
    );

    const result = await generateMockups({ supabase, userId: "user-1" }, bundle.id as string, design.id as string, ["tshirt", "mug"], { providerOverride: provider });

    const tshirt = result.results.find((r) => r.templateType === "tshirt");
    const mug = result.results.find((r) => r.templateType === "mug");
    expect(tshirt?.status).toBe("completed");
    expect(mug?.status).toBe("failed");

    const tshirtRow = db.mockups.find((m) => m.template_type === "tshirt");
    const mugRow = db.mockups.find((m) => m.template_type === "mug");
    expect(tshirtRow?.status).toBe("completed");
    expect(mugRow?.status).toBe("failed");
    expect(mugRow?.storage_path).toBeUndefined();
  });

  it("retry reuses the SAME row for the same (bundle, design, template) — no duplicate", async () => {
    const db: Db = { designs: [], product_bundles: [], mockups: [] };
    const { design, bundle } = makeBundleAndDesign(db);
    const supabase = makeFakeSupabase(db);
    const failingProvider = makeStubProvider(() => ({ ok: false, errorMessage: "first attempt fails" }));

    await generateMockups({ supabase, userId: "user-1" }, bundle.id as string, design.id as string, ["tshirt"], { providerOverride: failingProvider });
    expect(db.mockups).toHaveLength(1);
    const firstRowId = db.mockups[0].id;

    const succeedingProvider = makeStubProvider(() => ({ ok: true, bytes: realPngBytes(), mimeType: "image/png", width: 800, height: 800, providerName: "stub", providerMockupId: "y" }));
    await generateMockups({ supabase, userId: "user-1" }, bundle.id as string, design.id as string, ["tshirt"], { providerOverride: succeedingProvider });

    expect(db.mockups).toHaveLength(1);
    expect(db.mockups[0].id).toBe(firstRowId);
    expect(db.mockups[0].status).toBe("completed");
  });

  it("rejects a mockup whose bytes don't actually match its claimed MIME type", async () => {
    const db: Db = { designs: [], product_bundles: [], mockups: [] };
    const { design, bundle } = makeBundleAndDesign(db);
    const supabase = makeFakeSupabase(db);
    const provider = makeStubProvider(() => ({ ok: true, bytes: Buffer.from("not a real png"), mimeType: "image/png", width: 800, height: 800, providerName: "stub", providerMockupId: "x" }));

    const result = await generateMockups({ supabase, userId: "user-1" }, bundle.id as string, design.id as string, ["tshirt"], { providerOverride: provider });
    expect(result.results[0].status).toBe("failed");
    expect(db.mockups[0].status).toBe("failed");
  });

  it("updates the bundle's mockup_count to the number of COMPLETED mockups", async () => {
    const db: Db = { designs: [], product_bundles: [], mockups: [] };
    const { design, bundle } = makeBundleAndDesign(db);
    const supabase = makeFakeSupabase(db);
    const provider = makeStubProvider((template) =>
      template === "mug" ? { ok: false, errorMessage: "fail" } : { ok: true, bytes: realPngBytes(), mimeType: "image/png", width: 800, height: 800, providerName: "stub", providerMockupId: "x" },
    );
    await generateMockups({ supabase, userId: "user-1" }, bundle.id as string, design.id as string, ["tshirt", "mug"], { providerOverride: provider });
    expect(db.product_bundles[0].mockup_count).toBe(1);
  });
});

describe("deleteMockup", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("removes the Storage object before the DB row", async () => {
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const db: Db = { designs: [], product_bundles: [{ id: "bundle-1", user_id: "user-1" }], mockups: [{ id: "mockup-1", bundle_id: "bundle-1", user_id: "user-1", storage_path: "x/mockup-1.png" }] };
    const supabase = makeFakeSupabase(db, { remove: removeSpy });

    await deleteMockup({ supabase, userId: "user-1" }, "mockup-1");

    expect(removeSpy).toHaveBeenCalledWith(["x/mockup-1.png"]);
    expect(db.mockups).toHaveLength(0);
  });

  it("keeps the row if Storage delete fails", async () => {
    const db: Db = { designs: [], product_bundles: [{ id: "bundle-1", user_id: "user-1" }], mockups: [{ id: "mockup-1", bundle_id: "bundle-1", user_id: "user-1", storage_path: "x/mockup-1.png" }] };
    const supabase = makeFakeSupabase(db, { remove: vi.fn(async () => ({ data: [], error: null })) });
    await expect(deleteMockup({ supabase, userId: "user-1" }, "mockup-1")).rejects.toBeInstanceOf(MockupServiceError);
    expect(db.mockups).toHaveLength(1);
  });
});

describe("getMockupDownloadUrl", () => {
  it("returns a signed URL for a completed mockup", async () => {
    const db: Db = { designs: [], product_bundles: [], mockups: [{ id: "mockup-1", user_id: "user-1", status: "completed", storage_path: "x/mockup-1.png", template_type: "tshirt" }] };
    const supabase = makeFakeSupabase(db);
    const result = await getMockupDownloadUrl({ supabase, userId: "user-1" }, "mockup-1");
    expect(result.filename).toMatch(/\.png$/);
  });

  it("throws for a mockup that isn't completed yet", async () => {
    const db: Db = { designs: [], product_bundles: [], mockups: [{ id: "mockup-1", user_id: "user-1", status: "processing", storage_path: null }] };
    const supabase = makeFakeSupabase(db);
    await expect(getMockupDownloadUrl({ supabase, userId: "user-1" }, "mockup-1")).rejects.toBeInstanceOf(MockupServiceError);
  });
});
