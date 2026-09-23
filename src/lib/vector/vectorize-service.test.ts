import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  vectorizeDesign,
  getVectorizationForDesign,
  getVectorizationDownloadUrl,
  deleteVectorization,
  resolveVectorizationsForDesigns,
  VectorizationServiceError,
} from "@/lib/vector/vectorize-service";
import type { VectorProvider, VectorizationResult } from "@/lib/vector/vector-provider";

type Row = Record<string, unknown>;
type Db = { designs: Row[]; vectorizations: Row[] };

let idCounter = 0;
function genId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

/**
 * A minimal, purpose-built in-memory fake of the Supabase JS client's
 * chainable query builder — supports exactly the operations
 * vectorize-service.ts actually calls (select/insert/update/delete with
 * eq/in/single/maybeSingle), plus a matching .storage.from() fake. Not a
 * general-purpose Supabase mock; scoped tightly to keep it honest about
 * what it does and doesn't verify.
 */
function makeFakeSupabase(db: Db, storageOverrides: Record<string, unknown> = {}) {
  function makeBuilder(op: "select" | "insert" | "update" | "delete", table: keyof Db, payload?: Row) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "list" | "single" | "maybeSingle" = "list";

    const builder = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
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
          if (matched.length === 0) return { data: null, error: { message: "no rows", code: "PGRST116" } };
          return { data: matched[0], error: null };
        }
        if (mode === "maybeSingle") {
          return { data: matched[0] ?? null, error: null };
        }
        return { data: matched, error: null };
      }
      if (op === "insert") {
        const row: Row = { id: genId(String(table)), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        if (table === "vectorizations" && db.vectorizations.some((r) => r.design_id === row.design_id)) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
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
        const remaining = db[table].filter((r) => !filters.every((f) => f(r)));
        const removedCount = db[table].length - remaining.length;
        db[table] = remaining;
        return { data: removedCount > 0 ? [{}] : [], error: null };
      }
      return { data: null, error: null };
    }

    return builder;
  }

  return {
    from(table: keyof Db) {
      return {
        select: () => makeBuilder("select", table),
        insert: (payload: Row) => makeBuilder("insert", table, payload),
        update: (payload: Row) => makeBuilder("update", table, payload),
        delete: () => makeBuilder("delete", table),
      };
    },
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({ data: { arrayBuffer: async () => new TextEncoder().encode("fake-png-bytes").buffer }, error: null })),
        upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed.example/vector.svg" }, error: null })),
        remove: vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null })),
        ...storageOverrides,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

const VALID_MOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="10" fill="#000"/></svg>`;

function makeStubProvider(result: VectorizationResult): VectorProvider {
  return {
    name: "stub",
    capabilities: { supportsColorLimit: false, supportsSimplifySetting: false, isDeterministic: true },
    vectorize: vi.fn(async () => result),
  };
}

function makeCompletedDesign(overrides: Row = {}): Row {
  return {
    id: genId("design"),
    user_id: "user-1",
    project_id: "project-1",
    status: "completed",
    storage_path: "user-1/project-1/design-1/original.png",
    width: 1024,
    height: 1024,
    title: "My Design",
    metadata: { mimeType: "image/png" },
    ...overrides,
  };
}

describe("vectorizeDesign", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it("rejects a design that isn't a completed, real stored raster (eligibility)", async () => {
    const db: Db = { designs: [makeCompletedDesign({ status: "pending", storage_path: null })], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    await expect(vectorizeDesign({ supabase, userId: "user-1" }, db.designs[0].id as string)).rejects.toMatchObject({
      code: "unsupported_design",
    });
  });

  it("rejects a mock design with only an inline image_url and no storage_path", async () => {
    const db: Db = { designs: [makeCompletedDesign({ storage_path: null, image_url: "data:image/svg+xml;base64,x" })], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    await expect(vectorizeDesign({ supabase, userId: "user-1" }, db.designs[0].id as string)).rejects.toMatchObject({
      code: "unsupported_design",
    });
  });

  it("rejects vectorizing a design owned by a different user", async () => {
    const db: Db = { designs: [makeCompletedDesign()], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    await expect(vectorizeDesign({ supabase, userId: "someone-else" }, db.designs[0].id as string)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("on success: creates a completed row with storage identity and metadata, never embedding the raster", async () => {
    const design = makeCompletedDesign();
    const db: Db = { designs: [design], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    const provider = makeStubProvider({
      ok: true,
      svg: VALID_MOCK_SVG,
      providerName: "stub",
      providerVectorizationId: "stub_1",
      settingsApplied: { maxColors: 4 },
    });

    const result = await vectorizeDesign({ supabase, userId: "user-1" }, design.id as string, { providerOverride: provider });

    expect(provider.vectorize).toHaveBeenCalledTimes(1);
    const row = db.vectorizations.find((v) => v.id === result.vectorizationId)!;
    expect(row.status).toBe("completed");
    expect(row.storage_bucket).toBe("generated-designs");
    expect(row.storage_path).toBe(`user-1/project-1/${design.id}/vector.svg`);
    expect(row.has_embedded_raster).toBe(false);
    expect(row.shape_count).toBeGreaterThan(0);
  });

  it("marks the row failed (not completed) when the provider itself fails, and never uploads anything", async () => {
    const design = makeCompletedDesign();
    const db: Db = { designs: [design], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    const provider = makeStubProvider({ ok: false, errorMessage: "Provider exploded." });

    await expect(vectorizeDesign({ supabase, userId: "user-1" }, design.id as string, { providerOverride: provider })).rejects.toMatchObject({
      code: "provider_error",
    });

    const row = db.vectorizations[0];
    expect(row.status).toBe("failed");
    expect(row.storage_path).toBeUndefined();
  });

  it("marks the row failed — not completed — when the provider's SVG embeds a raster image", async () => {
    const design = makeCompletedDesign();
    const db: Db = { designs: [design], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    const fakeRasterSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,AAAA" width="10" height="10"/></svg>`;
    const provider = makeStubProvider({ ok: true, svg: fakeRasterSvg, providerName: "stub", providerVectorizationId: "x", settingsApplied: {} });

    await expect(vectorizeDesign({ supabase, userId: "user-1" }, design.id as string, { providerOverride: provider })).rejects.toMatchObject({
      code: "embedded_raster",
    });

    expect(db.vectorizations[0].status).toBe("failed");
    expect(db.vectorizations[0].storage_path).toBeUndefined();
  });

  it("retry reuses the SAME row (no duplicate) after a prior failure", async () => {
    const design = makeCompletedDesign();
    const db: Db = { designs: [design], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    const failingProvider = makeStubProvider({ ok: false, errorMessage: "first attempt fails" });

    await expect(vectorizeDesign({ supabase, userId: "user-1" }, design.id as string, { providerOverride: failingProvider })).rejects.toBeInstanceOf(
      VectorizationServiceError,
    );
    expect(db.vectorizations).toHaveLength(1);
    const firstRowId = db.vectorizations[0].id;

    const succeedingProvider = makeStubProvider({ ok: true, svg: VALID_MOCK_SVG, providerName: "stub", providerVectorizationId: "y", settingsApplied: {} });
    const result = await vectorizeDesign({ supabase, userId: "user-1" }, design.id as string, { providerOverride: succeedingProvider });

    expect(db.vectorizations).toHaveLength(1);
    expect(result.vectorizationId).toBe(firstRowId);
    expect(db.vectorizations[0].status).toBe("completed");
  });

  it("rejects re-vectorizing a design that already has a completed result", async () => {
    const design = makeCompletedDesign();
    const db: Db = {
      designs: [design],
      vectorizations: [{ id: genId("vec"), user_id: "user-1", project_id: "project-1", design_id: design.id, status: "completed" }],
    };
    const supabase = makeFakeSupabase(db);
    await expect(vectorizeDesign({ supabase, userId: "user-1" }, design.id as string)).rejects.toMatchObject({ code: "already_completed" });
  });

  it("rejects a second call while one is already processing", async () => {
    const design = makeCompletedDesign();
    const db: Db = {
      designs: [design],
      vectorizations: [{ id: genId("vec"), user_id: "user-1", project_id: "project-1", design_id: design.id, status: "processing" }],
    };
    const supabase = makeFakeSupabase(db);
    await expect(vectorizeDesign({ supabase, userId: "user-1" }, design.id as string)).rejects.toMatchObject({ code: "already_active" });
  });
});

/**
 * APPLICATION-LAYER ownership-consistency tests — a different layer than
 * the RLS fix in the migration. These use the same in-memory fake as the
 * rest of this file, which does NOT evaluate real Postgres RLS policies,
 * so they cannot prove the database itself rejects a cross-user
 * (user_id, design_id, project_id) triple — that requires a live
 * Postgres run against the applied migration (see
 * supabase/tests/20260926_vectorizations_rls.sql, documented there and
 * NOT run automatically, since the migration hasn't been applied).
 * What these tests DO prove: vectorizeDesign() never has the opportunity
 * to construct a mismatched triple in the first place, because
 * project_id is always read off the SAME already-ownership-verified
 * design row design_id came from (see the `project_id: design.project_id`
 * insert payload in vectorize-service.ts) — it is never taken from caller
 * input. This is defense-in-depth at the application layer, independent
 * of and in addition to the database-level RLS fix.
 */
describe("vectorizeDesign — application-layer ownership consistency (not an RLS test — see supabase/tests/20260926_vectorizations_rls.sql for that)", () => {
  it("never inserts a project_id other than the owning design's own project_id", async () => {
    const design = makeCompletedDesign({ project_id: "project-real" });
    const db: Db = { designs: [design], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    const provider = makeStubProvider({ ok: true, svg: VALID_MOCK_SVG, providerName: "stub", providerVectorizationId: "z", settingsApplied: {} });

    await vectorizeDesign({ supabase, userId: "user-1" }, design.id as string, { providerOverride: provider });

    expect(db.vectorizations).toHaveLength(1);
    expect(db.vectorizations[0].project_id).toBe("project-real");
    expect(db.vectorizations[0].design_id).toBe(design.id);
    expect(db.vectorizations[0].user_id).toBe("user-1");
  });

  it("cannot be made to target a design belonging to a different user — ownership is re-derived server-side from ctx.userId, never taken from any caller-suppliable field", async () => {
    const bDesign = makeCompletedDesign({ user_id: "user-B", project_id: "project-B" });
    const db: Db = { designs: [bDesign], vectorizations: [] };
    const supabase = makeFakeSupabase(db);

    // Caller is user-A; vectorizeDesign() takes only a designId, so
    // there is no field through which user-A could ever supply user-B's
    // project_id or claim ownership of user-B's design.
    await expect(vectorizeDesign({ supabase, userId: "user-A" }, bDesign.id as string)).rejects.toMatchObject({ code: "not_found" });
    expect(db.vectorizations).toHaveLength(0);
  });
});

describe("getVectorizationDownloadUrl", () => {
  it("returns a signed URL with a .svg filename for a completed vectorization owned by the caller", async () => {
    const design = makeCompletedDesign({ title: "Cute Cat!!" });
    const db: Db = {
      designs: [design],
      vectorizations: [{ id: genId("vec"), user_id: "user-1", project_id: "project-1", design_id: design.id, status: "completed", storage_path: "x/vector.svg" }],
    };
    const supabase = makeFakeSupabase(db);
    const result = await getVectorizationDownloadUrl({ supabase, userId: "user-1" }, design.id as string);
    expect(result.filename).toMatch(/\.svg$/);
    expect(result.url).toBe("https://signed.example/vector.svg");
  });

  it("throws when there is no completed vectorization yet", async () => {
    const design = makeCompletedDesign();
    const db: Db = { designs: [design], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    await expect(getVectorizationDownloadUrl({ supabase, userId: "user-1" }, design.id as string)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deleteVectorization", () => {
  it("removes the Storage object before the database row (storage-first)", async () => {
    const design = makeCompletedDesign();
    const vecId = genId("vec");
    const db: Db = {
      designs: [design],
      vectorizations: [{ id: vecId, user_id: "user-1", project_id: "project-1", design_id: design.id, status: "completed", storage_path: "user-1/project-1/x/vector.svg" }],
    };
    const removeSpy = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    const supabase = makeFakeSupabase(db, { remove: removeSpy });

    await deleteVectorization({ supabase, userId: "user-1" }, design.id as string);

    expect(removeSpy).toHaveBeenCalledWith(["user-1/project-1/x/vector.svg"]);
    expect(db.vectorizations).toHaveLength(0);
  });

  it("keeps the row intact if the Storage delete fails", async () => {
    const design = makeCompletedDesign();
    const db: Db = {
      designs: [design],
      vectorizations: [{ id: genId("vec"), user_id: "user-1", project_id: "project-1", design_id: design.id, status: "completed", storage_path: "user-1/project-1/x/vector.svg" }],
    };
    const supabase = makeFakeSupabase(db, { remove: vi.fn(async () => ({ data: [], error: null })) });

    await expect(deleteVectorization({ supabase, userId: "user-1" }, design.id as string)).rejects.toMatchObject({ code: "storage_error" });
    expect(db.vectorizations).toHaveLength(1);
  });
});

describe("getVectorizationForDesign", () => {
  it("returns null before the migration is applied instead of throwing", async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { code: "PGRST205", message: "table not found" } }),
            }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const result = await getVectorizationForDesign({ supabase, userId: "user-1" }, "design-1");
    expect(result).toBeNull();
  });
});

describe("resolveVectorizationsForDesigns", () => {
  it("returns an empty map for an empty input without querying", async () => {
    const db: Db = { designs: [], vectorizations: [] };
    const supabase = makeFakeSupabase(db);
    const result = await resolveVectorizationsForDesigns(supabase, []);
    expect(result.size).toBe(0);
  });

  it("keys results by design_id", async () => {
    const design = makeCompletedDesign();
    const db: Db = {
      designs: [design],
      vectorizations: [{ id: genId("vec"), user_id: "user-1", project_id: "project-1", design_id: design.id, status: "completed" }],
    };
    const supabase = makeFakeSupabase(db);
    const result = await resolveVectorizationsForDesigns(supabase, [design.id as string]);
    expect(result.get(design.id as string)).toMatchObject({ status: "completed" });
  });
});
