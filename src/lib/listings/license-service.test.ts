import { describe, it, expect } from "vitest";

import { generateLicense, updateLicenseText, resetLicenseTemplate, LicenseServiceError } from "@/lib/listings/license-service";

type Row = Record<string, unknown>;
type Db = { product_bundles: Row[]; projects: Row[]; product_listings: Row[] };

function makeFakeSupabase(db: Db) {
  function makeBuilder(op: "select" | "update", table: keyof Db, payload?: Row) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "list" | "single" | "maybeSingle" = "list";

    const builder = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
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
      const matched = db[table].filter((r) => filters.every((f) => f(r)));
      matched.forEach((r) => Object.assign(r, payload));
      return { data: matched, error: null };
    }

    return builder;
  }

  return {
    from(table: keyof Db) {
      return {
        select: () => makeBuilder("select", table),
        update: (payload: Row) => makeBuilder("update", table, payload),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

function baseDb(): Db {
  return {
    product_bundles: [{ id: "b1", user_id: "u1", project_id: "p1", name: "Cat Stickers" }],
    projects: [{ id: "p1", user_id: "u1", product_type: "sticker_pack" }],
    product_listings: [{ id: "l1", user_id: "u1", bundle_id: "b1", license_type: null, license_text: null, license_edited: false }],
  };
}

describe("generateLicense", () => {
  it("generates personal-use license text mentioning no resale of source files", async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);

    await generateLicense({ supabase, userId: "u1" }, "l1", "personal");

    expect(db.product_listings[0].license_type).toBe("personal");
    expect(db.product_listings[0].license_edited).toBe(false);
    expect(db.product_listings[0].license_text as string).toContain("PERSONAL USE");
    expect((db.product_listings[0].license_text as string).toLowerCase()).toContain("resale");
  });

  it("generates commercial license text distinguishing it from redistribution of source files", async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);

    await generateLicense({ supabase, userId: "u1" }, "l1", "commercial");

    const text = db.product_listings[0].license_text as string;
    expect(text).toContain("COMMERCIAL USE");
    expect(text.toLowerCase()).toContain("redistribution");
  });

  it("generates extended_commercial license text", async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);

    await generateLicense({ supabase, userId: "u1" }, "l1", "extended_commercial");

    expect(db.product_listings[0].license_text as string).toContain("EXTENDED COMMERCIAL USE");
  });

  it("includes a not-legal-advice disclaimer in every template", async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);

    await generateLicense({ supabase, userId: "u1" }, "l1", "personal");

    expect((db.product_listings[0].license_text as string).toLowerCase()).toContain("not legal advice");
  });

  it("is deterministic for the same license type and bundle", async () => {
    const db1 = baseDb();
    const db2 = baseDb();
    await generateLicense({ supabase: makeFakeSupabase(db1), userId: "u1" }, "l1", "commercial");
    await generateLicense({ supabase: makeFakeSupabase(db2), userId: "u1" }, "l1", "commercial");
    expect(db1.product_listings[0].license_text).toBe(db2.product_listings[0].license_text);
  });

  it("edit protection: switching license type on a manually edited license requires confirmOverwriteEdits", async () => {
    const db = baseDb();
    db.product_listings[0].license_type = "personal";
    db.product_listings[0].license_text = "My hand-edited license text";
    db.product_listings[0].license_edited = true;
    const supabase = makeFakeSupabase(db);

    await expect(generateLicense({ supabase, userId: "u1" }, "l1", "commercial")).rejects.toMatchObject({ code: "edit_protected" });
    expect(db.product_listings[0].license_text).toBe("My hand-edited license text");
  });

  it("edit protection: confirmOverwriteEdits=true proceeds and clears the edited flag", async () => {
    const db = baseDb();
    db.product_listings[0].license_type = "personal";
    db.product_listings[0].license_text = "My hand-edited license text";
    db.product_listings[0].license_edited = true;
    const supabase = makeFakeSupabase(db);

    await generateLicense({ supabase, userId: "u1" }, "l1", "commercial", { confirmOverwriteEdits: true });

    expect(db.product_listings[0].license_type).toBe("commercial");
    expect(db.product_listings[0].license_edited).toBe(false);
    expect(db.product_listings[0].license_text).toContain("COMMERCIAL USE");
  });

  it("throws not_found for a listing the user does not own", async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);
    await expect(generateLicense({ supabase, userId: "someone-else" }, "l1", "personal")).rejects.toBeInstanceOf(LicenseServiceError);
  });
});

describe("updateLicenseText", () => {
  it("saves manual edits and marks license_edited = true", async () => {
    const db = baseDb();
    db.product_listings[0].license_type = "personal";
    const supabase = makeFakeSupabase(db);

    await updateLicenseText({ supabase, userId: "u1" }, "l1", "My custom terms");

    expect(db.product_listings[0].license_text).toBe("My custom terms");
    expect(db.product_listings[0].license_edited).toBe(true);
  });
});

describe("resetLicenseTemplate", () => {
  it("regenerates the template for the CURRENT license_type without requiring confirmation", async () => {
    const db = baseDb();
    db.product_listings[0].license_type = "extended_commercial";
    db.product_listings[0].license_text = "Hand-edited text";
    db.product_listings[0].license_edited = true;
    const supabase = makeFakeSupabase(db);

    await resetLicenseTemplate({ supabase, userId: "u1" }, "l1");

    expect(db.product_listings[0].license_text).toContain("EXTENDED COMMERCIAL USE");
    expect(db.product_listings[0].license_edited).toBe(false);
  });

  it("throws invalid_config when no license_type has been chosen yet", async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);
    await expect(resetLicenseTemplate({ supabase, userId: "u1" }, "l1")).rejects.toMatchObject({ code: "invalid_config" });
  });
});
