import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import JSZip from "jszip";

import {
  buildPackage,
  checkPackagePrerequisites,
  deletePackage,
  getPackageDownloadUrl,
  loadPackagesForBundle,
  loadMyPackages,
  PackageServiceError,
} from "@/lib/packages/package-service";

type Row = Record<string, unknown>;
type Db = {
  projects: Row[];
  designs: Row[];
  vectorizations: Row[];
  product_bundles: Row[];
  bundle_items: Row[];
  mockups: Row[];
  product_listings: Row[];
  product_packages: Row[];
};

let idCounter = 0;
function genId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', "utf8");

/**
 * Same in-memory fake-Supabase approach as bundle-service.test.ts, extended
 * with .in()/count-head support (package-service's ownership/asset queries
 * need both) and a configurable Storage double that serves fixed bytes per
 * path so buildPackage's real download -> validate -> zip -> checksum ->
 * upload pipeline runs against real bytes, not stubs.
 */
function makeFakeSupabase(db: Db, opts: { storageBytes?: Map<string, Buffer>; storageOverrides?: Record<string, unknown> } = {}) {
  const storageBytes = opts.storageBytes ?? new Map<string, Buffer>();

  function makeBuilder(op: "select" | "insert" | "update" | "delete" | "upsert", table: keyof Db, payload?: Row, selectCols?: string, countOnly = false) {
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
      if (op === "select") {
        const matched = db[table].filter((r) => filters.every((f) => f(r)));
        if (countOnly) return { data: null, error: null, count: matched.length };
        if (mode === "single") {
          if (matched.length === 0) return { data: null, error: { message: "no rows", code: "PGRST116" } };
          return { data: matched[0], error: null };
        }
        if (mode === "maybeSingle") return { data: matched[0] ?? null, error: null };
        return { data: matched, error: null };
      }
      if (op === "insert") {
        const row: Row = { id: genId(String(table)), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
        if (table === "product_packages") {
          Object.assign(row, {
            status: row.status ?? "queued",
            version: row.version ?? 0,
            item_count: row.item_count ?? 0,
            manifest: row.manifest ?? {},
            storage_bucket: row.storage_bucket ?? null,
            storage_path: row.storage_path ?? null,
          });
          const conflict = db.product_packages.find((r) => r.bundle_id === row.bundle_id && r.marketplace === row.marketplace);
          if (conflict) return { data: null, error: { message: "duplicate", code: "23505" } };
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
        db[table] = remaining;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }

    return builder;
  }

  const removedPaths: string[] = [];
  const uploadedPaths: Map<string, Buffer> = new Map();
  let failNextUpload = false;
  let failNextDelete = false;

  return {
    _internals: { removedPaths, uploadedPaths, setFailNextUpload: (v: boolean) => (failNextUpload = v), setFailNextDelete: (v: boolean) => (failNextDelete = v) },
    from(table: keyof Db) {
      return {
        select: (cols?: string, sel?: { count?: string; head?: boolean }) => makeBuilder("select", table, undefined, cols, !!sel?.head),
        insert: (payload: Row) => makeBuilder("insert", table, payload),
        upsert: (payload: Row) => makeBuilder("upsert", table, payload),
        update: (payload: Row) => makeBuilder("update", table, payload),
        delete: () => makeBuilder("delete", table),
      };
    },
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async (path: string) => {
          const bytes = uploadedPaths.get(path) ?? storageBytes.get(path);
          if (!bytes) return { data: null, error: { message: "not found" } };
          return { data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, error: null };
        }),
        upload: vi.fn(async (path: string, bytes: Buffer) => {
          if (failNextUpload) return { data: null, error: { message: "simulated upload failure" } };
          uploadedPaths.set(path, bytes);
          return { data: { path }, error: null };
        }),
        remove: vi.fn(async (paths: string[]) => {
          if (failNextDelete) return { data: null, error: { message: "simulated delete failure" } };
          for (const p of paths) {
            uploadedPaths.delete(p);
            removedPaths.push(p);
          }
          return { data: paths.map((name) => ({ name })), error: null };
        }),
        createSignedUrl: vi.fn(async (path: string) => {
          if (!uploadedPaths.has(path) && !storageBytes.has(path)) return { data: null, error: { message: "not found" } };
          return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
        }),
        ...(opts.storageOverrides ?? {}),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

function baseFixture(): { db: Db; storageBytes: Map<string, Buffer> } {
  const projectId = "project-1";
  const bundleId = "bundle-1";
  const designId = "design-1";
  const userId = "user-1";
  const pngPath = "user-1/project-1/design-1/original.png";
  const svgPath = "user-1/project-1/design-1/vector.svg";

  const db: Db = {
    projects: [{ id: projectId, user_id: userId, name: "My Product", product_type: "sticker_pack" }],
    designs: [{ id: designId, user_id: userId, project_id: projectId, title: "Christmas Cat", status: "completed", storage_path: pngPath }],
    vectorizations: [{ design_id: designId, user_id: userId, project_id: projectId, status: "completed", storage_path: svgPath }],
    product_bundles: [{ id: bundleId, user_id: userId, project_id: projectId, name: "Cute Bundle", cover_storage_path: null }],
    bundle_items: [{ id: genId("item"), bundle_id: bundleId, design_id: designId, user_id: userId, include_png: true, include_svg: true, created_at: new Date(2020, 0, 1).toISOString() }],
    mockups: [],
    product_listings: [],
    product_packages: [],
  };

  const storageBytes = new Map<string, Buffer>([
    [pngPath, PNG_MAGIC],
    [svgPath, SVG_BYTES],
  ]);

  return { db, storageBytes };
}

beforeEach(() => {
  idCounter = 0;
});

describe("checkPackagePrerequisites", () => {
  it("blocks when no bundle items are selected", async () => {
    const { db, storageBytes } = baseFixture();
    db.bundle_items = [];
    const supabase = makeFakeSupabase(db, { storageBytes });
    const result = await checkPackagePrerequisites({ supabase, userId: "user-1" }, "bundle-1", "generic");
    expect(result.ok).toBe(false);
    expect(result.blocking).toContain("Select at least one bundle item.");
  });

  it("blocks when PNG is requested but the design has no completed raster", async () => {
    const { db, storageBytes } = baseFixture();
    db.designs[0].status = "pending";
    const supabase = makeFakeSupabase(db, { storageBytes });
    const result = await checkPackagePrerequisites({ supabase, userId: "user-1" }, "bundle-1", "generic");
    expect(result.ok).toBe(false);
    expect(result.blocking.some((b) => b.includes("PNG requested"))).toBe(true);
  });

  it("blocks when SVG is requested but no completed vectorization exists", async () => {
    const { db, storageBytes } = baseFixture();
    db.vectorizations = [];
    const supabase = makeFakeSupabase(db, { storageBytes });
    const result = await checkPackagePrerequisites({ supabase, userId: "user-1" }, "bundle-1", "generic");
    expect(result.ok).toBe(false);
    expect(result.blocking.some((b) => b.includes("SVG requested"))).toBe(true);
  });

  it("warns (non-blocking) about a missing listing, license, mockups, and cover", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    const result = await checkPackagePrerequisites({ supabase, userId: "user-1" }, "bundle-1", "generic");
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("Listing not created"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("No bundle cover"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("No mockups"))).toBe(true);
  });

  it("rejects a bundle owned by a different user (not_found, no cross-user leak)", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    await expect(checkPackagePrerequisites({ supabase, userId: "user-B" }, "bundle-1", "generic")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("buildPackage — PNG-only bundle", () => {
  it("produces a ZIP with a PNG folder only — no SVG/MOCKUPS/PREVIEW folders, matching spec section 1", async () => {
    const { db, storageBytes } = baseFixture();
    db.bundle_items[0].include_svg = false;
    const supabase = makeFakeSupabase(db, { storageBytes });

    const result = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    const pkgRow = db.product_packages.find((p) => p.id === result.packageId)!;
    expect(pkgRow.status).toBe("completed");
    expect(pkgRow.storage_path).toBeTruthy();
    expect(pkgRow.version).toBe(1);
    expect(pkgRow.checksum_sha256).toMatch(/^[0-9a-f]{64}$/);

    const zipBytes = (supabase as unknown as { _internals: { uploadedPaths: Map<string, Buffer> } })._internals.uploadedPaths.get(pkgRow.storage_path as string)!;
    const checksum = createHash("sha256").update(zipBytes).digest("hex");
    expect(checksum).toBe(pkgRow.checksum_sha256);

    const zip = await JSZip.loadAsync(zipBytes);
    const files = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(files.some((f) => f.includes("/PNG/"))).toBe(true);
    expect(files.some((f) => f.includes("/SVG/"))).toBe(false);
    expect(files.some((f) => f.includes("/MOCKUPS/"))).toBe(false);
    expect(files.some((f) => f.includes("/PREVIEW/"))).toBe(false);
    expect(files.some((f) => f.endsWith("README.txt"))).toBe(true);
    expect(files.some((f) => f.endsWith("listing.txt"))).toBe(false);
    expect(files.some((f) => f.endsWith("license.txt"))).toBe(false);
  });
});

describe("buildPackage — full bundle (PNG+SVG+mockup+cover+listing+license)", () => {
  it("includes every real asset with correct content, and listing.txt/license.txt reflect the SAVED listing verbatim", async () => {
    const { db, storageBytes } = baseFixture();
    const mockupPath = "user-1/project-1/bundles/bundle-1/mockups/mockup-1.png";
    storageBytes.set(mockupPath, PNG_MAGIC);
    db.mockups = [{ id: "mockup-1", bundle_id: "bundle-1", design_id: "design-1", user_id: "user-1", project_id: "project-1", template_type: "tshirt", status: "completed", storage_path: mockupPath }];

    const coverPath = "user-1/project-1/bundles/bundle-1/cover.png";
    storageBytes.set(coverPath, PNG_MAGIC);
    db.product_bundles[0].cover_storage_path = coverPath;

    db.product_listings = [
      {
        id: "listing-1",
        bundle_id: "bundle-1",
        user_id: "user-1",
        project_id: "project-1",
        marketplace: "generic",
        title: "Cute Christmas Cat Stickers",
        description: "A festive sticker set.",
        tags: ["cute", "christmas"],
        seo_keywords: ["cat sticker"],
        included_files: ["PNG", "SVG"],
        materials: ["Digital file"],
        license_type: "personal",
        license_text: "My exact hand-saved license terms.",
      },
    ];

    const supabase = makeFakeSupabase(db, { storageBytes });
    const result = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    const pkgRow = db.product_packages.find((p) => p.id === result.packageId)!;
    const zipBytes = (supabase as unknown as { _internals: { uploadedPaths: Map<string, Buffer> } })._internals.uploadedPaths.get(pkgRow.storage_path as string)!;
    const zip = await JSZip.loadAsync(zipBytes);
    const files = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

    expect(files.some((f) => f.includes("/PNG/") && f.endsWith(".png"))).toBe(true);
    expect(files.some((f) => f.includes("/SVG/") && f.endsWith(".svg"))).toBe(true);
    expect(files.some((f) => f.includes("/MOCKUPS/tshirt.png"))).toBe(true);
    expect(files.some((f) => f.endsWith("/PREVIEW/bundle-cover.png"))).toBe(true);

    const listingEntry = files.find((f) => f.endsWith("listing.txt"))!;
    const listingText = await zip.file(listingEntry)!.async("string");
    expect(listingText).toContain("Cute Christmas Cat Stickers");
    expect(listingText).toContain("A festive sticker set.");
    expect(listingText).toContain("cute, christmas");

    const licenseEntry = files.find((f) => f.endsWith("license.txt"))!;
    const licenseText = await zip.file(licenseEntry)!.async("string");
    expect(licenseText).toBe("My exact hand-saved license terms.");

    expect(pkgRow.item_count).toBe(files.length);
  });
});

describe("buildPackage — canonical row / idempotency", () => {
  it("rebuilding the SAME bundle+marketplace updates the SAME row, never inserting a duplicate", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });

    const first = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    const second = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");

    expect(first.packageId).toBe(second.packageId);
    expect(db.product_packages).toHaveLength(1);
    expect(db.product_packages[0].version).toBe(2);
  });

  it("a second marketplace for the SAME bundle gets its OWN row", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });

    await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "etsy");

    expect(db.product_packages).toHaveLength(2);
    expect(new Set(db.product_packages.map((p) => p.marketplace))).toEqual(new Set(["generic", "etsy"]));
  });

  it("a FAILED rebuild preserves the previous valid package — storage_path/checksum/version untouched, status flips to failed", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });

    const first = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    const beforeRow = { ...db.product_packages.find((p) => p.id === first.packageId)! };
    expect(beforeRow.status).toBe("completed");

    // Force the rebuild to fail: the design's PNG becomes unreadable mid-way (simulated storage read failure).
    storageBytes.delete("user-1/project-1/design-1/original.png");

    await expect(buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic")).rejects.toThrow(PackageServiceError);

    const afterRow = db.product_packages.find((p) => p.id === first.packageId)!;
    expect(afterRow.status).toBe("failed");
    expect(afterRow.error_message).toBeTruthy();
    // The previous valid package is fully preserved:
    expect(afterRow.storage_path).toBe(beforeRow.storage_path);
    expect(afterRow.checksum_sha256).toBe(beforeRow.checksum_sha256);
    expect(afterRow.version).toBe(beforeRow.version);
    expect(afterRow.file_size_bytes).toBe(beforeRow.file_size_bytes);
  });

  it("a failed FIRST build (never succeeded before) leaves storage_path null, status failed", async () => {
    const { db, storageBytes } = baseFixture();
    db.designs[0].status = "pending"; // blocking prerequisite: PNG requested but not completed
    const supabase = makeFakeSupabase(db, { storageBytes });

    await expect(buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic")).rejects.toMatchObject({ code: "asset_missing" });
    expect(db.product_packages).toHaveLength(1);
    expect(db.product_packages[0].status).toBe("failed");
    expect(db.product_packages[0].storage_path).toBeNull();
  });

  it("Storage upload failure marks the row failed without touching a previous valid package", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });

    const first = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    const beforeRow = { ...db.product_packages.find((p) => p.id === first.packageId)! };

    (supabase as unknown as { _internals: { setFailNextUpload: (v: boolean) => void } })._internals.setFailNextUpload(true);
    await expect(buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic")).rejects.toMatchObject({ code: "storage_error" });

    const afterRow = db.product_packages.find((p) => p.id === first.packageId)!;
    expect(afterRow.status).toBe("failed");
    expect(afterRow.storage_path).toBe(beforeRow.storage_path);
    expect(afterRow.version).toBe(beforeRow.version);
  });
});

describe("buildPackage — cross-user isolation", () => {
  it("rejects building a package for a bundle owned by a different user", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    await expect(buildPackage({ supabase, userId: "user-B" }, "bundle-1", "generic")).rejects.toMatchObject({ code: "not_found" });
    expect(db.product_packages).toHaveLength(0);
  });
});

describe("deletePackage", () => {
  it("removes the Storage object BEFORE the DB row (storage-first delete)", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    const { packageId } = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");

    await deletePackage({ supabase, userId: "user-1" }, packageId);
    expect(db.product_packages).toHaveLength(0);
    const internals = (supabase as unknown as { _internals: { removedPaths: string[] } })._internals;
    expect(internals.removedPaths.length).toBeGreaterThan(0);
  });

  it("keeps the DB row when Storage deletion fails — never pretends deletion succeeded", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    const { packageId } = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");

    (supabase as unknown as { _internals: { setFailNextDelete: (v: boolean) => void } })._internals.setFailNextDelete(true);
    await expect(deletePackage({ supabase, userId: "user-1" }, packageId)).rejects.toMatchObject({ code: "storage_error" });
    expect(db.product_packages).toHaveLength(1);
  });

  it("rejects deleting a package owned by a different user", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    const { packageId } = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    await expect(deletePackage({ supabase, userId: "user-B" }, packageId)).rejects.toMatchObject({ code: "not_found" });
    expect(db.product_packages).toHaveLength(1);
  });
});

describe("getPackageDownloadUrl", () => {
  it("returns a signed URL and the seller-facing filename for a built package", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    const { packageId } = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");

    const result = await getPackageDownloadUrl({ supabase, userId: "user-1" }, packageId);
    expect(result.url).toContain("https://signed.example/");
    expect(result.filename).toBe("cute-bundle.zip");
  });

  it("refuses to download a package that has never been built", async () => {
    const { db, storageBytes } = baseFixture();
    db.product_packages.push({ id: "pkg-empty", user_id: "user-1", project_id: "project-1", bundle_id: "bundle-1", marketplace: "etsy", status: "queued", storage_path: null });
    const supabase = makeFakeSupabase(db, { storageBytes });
    await expect(getPackageDownloadUrl({ supabase, userId: "user-1" }, "pkg-empty")).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a download request for a package owned by a different user — no guessing by package id", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    const { packageId } = await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    await expect(getPackageDownloadUrl({ supabase, userId: "user-B" }, packageId)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("loadPackagesForBundle / loadMyPackages", () => {
  it("loadMyPackages only returns packages that have a successful build (storage_path set)", async () => {
    const { db, storageBytes } = baseFixture();
    db.product_packages.push({ id: "pkg-never-built", user_id: "user-1", project_id: "project-1", bundle_id: "bundle-1", marketplace: "etsy", status: "failed", storage_path: null, updated_at: new Date().toISOString() });
    const supabase = makeFakeSupabase(db, { storageBytes });
    await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");

    const packages = await loadMyPackages({ supabase, userId: "user-1" });
    expect(packages).toHaveLength(1);
    expect(packages[0].marketplace).toBe("generic");
    expect(packages[0].bundleName).toBe("Cute Bundle");
    expect(packages[0].projectName).toBe("My Product");
  });

  it("loadPackagesForBundle returns rows regardless of build status (used for the bundle detail page's per-marketplace state)", async () => {
    const { db, storageBytes } = baseFixture();
    const supabase = makeFakeSupabase(db, { storageBytes });
    await buildPackage({ supabase, userId: "user-1" }, "bundle-1", "generic");
    const rows = await loadPackagesForBundle({ supabase, userId: "user-1" }, "bundle-1");
    expect(rows).toHaveLength(1);
  });
});
