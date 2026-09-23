import { describe, it, expect } from "vitest";

import { generateListingContent, generateListingSection, ListingGenerationServiceError } from "@/lib/listings/listing-generation-service";
import { MockTextProvider } from "@/lib/ai/providers/mock-text-provider";
import type { TextProvider, TextGenerationResult } from "@/lib/ai/text-provider";

type Row = Record<string, unknown>;
type Db = { projects: Row[]; product_bundles: Row[]; bundle_items: Row[]; designs: Row[] };

function makeFakeSupabase(db: Db) {
  function makeBuilder(table: keyof Db, selectColsHolder: { cols?: string }) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: "list" | "single" | "maybeSingle" = "list";

    const builder = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      select(cols?: string) {
        selectColsHolder.cols = cols;
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
      let matched = db[table].filter((r) => filters.every((f) => f(r)));
      if (table === "bundle_items" && selectColsHolder.cols?.includes("designs(title)")) {
        matched = matched.map((r) => ({
          ...r,
          designs: db.designs.find((d) => d.id === r.design_id) ? { title: db.designs.find((d) => d.id === r.design_id)!.title } : null,
        }));
      }
      if (mode === "single") {
        if (matched.length === 0) return { data: null, error: { message: "no rows" } };
        return { data: matched[0], error: null };
      }
      if (mode === "maybeSingle") return { data: matched[0] ?? null, error: null };
      return { data: matched, error: null };
    }

    return builder;
  }

  return {
    from(table: keyof Db) {
      const selectColsHolder: { cols?: string } = {};
      return { select: (cols?: string) => makeBuilder(table, selectColsHolder).select(cols) };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

function baseDb(): Db {
  return {
    projects: [
      {
        id: "p1",
        user_id: "u1",
        product_type: "sticker_pack",
        user_prompt: "Cute cat stickers",
        style: ["cute"],
        custom_style: null,
        target_audience: ["planner enthusiasts"],
        custom_audience: null,
      },
    ],
    product_bundles: [{ id: "b1", user_id: "u1", project_id: "p1", name: "Cat Sticker Bundle" }],
    bundle_items: [],
    designs: [
      { id: "d1", title: "Cat 1" },
      { id: "d2", title: "Cat 2" },
    ],
  };
}

class FailingProvider implements TextProvider {
  readonly name = "failing";
  async generateText(): Promise<TextGenerationResult> {
    return { ok: false, errorMessage: "simulated provider outage" };
  }
}

class GarbageProvider implements TextProvider {
  readonly name = "garbage";
  async generateText(): Promise<TextGenerationResult> {
    return { ok: true, text: "" }; // empty -> fails Zod validation
  }
}

describe("generateListingContent", () => {
  it("generates title/description/tags/keywords from real bundle+project context using the mock provider", async () => {
    const db = baseDb();
    db.bundle_items = [
      { bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: false },
      { bundle_id: "b1", user_id: "u1", design_id: "d2", include_png: true, include_svg: true },
    ];
    const supabase = makeFakeSupabase(db);

    const result = await generateListingContent({ supabase, userId: "u1" }, "b1", "generic", { providerOverride: new MockTextProvider() });

    expect(result.title.length).toBeGreaterThan(0);
    expect(result.description.length).toBeGreaterThan(0);
    expect(result.tags.length).toBeGreaterThan(0);
    expect(result.seoKeywords.length).toBeGreaterThan(0);
    expect(result.providerName).toBe("mock");
  });

  it("format honesty: a PNG-only bundle's description/includedFiles never claims SVG", async () => {
    const db = baseDb();
    db.bundle_items = [{ bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: false }];
    const supabase = makeFakeSupabase(db);

    const result = await generateListingContent({ supabase, userId: "u1" }, "b1", "generic", { providerOverride: new MockTextProvider() });

    expect(result.includedFiles).toEqual(["PNG"]);
    expect(result.description).not.toContain("SVG");
    expect(result.materials).toContain("PNG file");
    expect(result.materials).not.toContain("SVG file");
  });

  it("format honesty: a PNG+SVG bundle's includedFiles lists both formats", async () => {
    const db = baseDb();
    db.bundle_items = [{ bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: true }];
    const supabase = makeFakeSupabase(db);

    const result = await generateListingContent({ supabase, userId: "u1" }, "b1", "generic", { providerOverride: new MockTextProvider() });

    expect(result.includedFiles).toEqual(["PNG", "SVG"]);
  });

  it("respects marketplace-specific limits (etsy tags capped at 13)", async () => {
    const db = baseDb();
    db.bundle_items = [{ bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: false }];
    const supabase = makeFakeSupabase(db);

    const result = await generateListingContent({ supabase, userId: "u1" }, "b1", "etsy", { providerOverride: new MockTextProvider() });
    expect(result.tags.length).toBeLessThanOrEqual(13);
    expect(result.title.length).toBeLessThanOrEqual(140);
  });

  it("throws not_found for a bundle the user does not own", async () => {
    const db = baseDb();
    const supabase = makeFakeSupabase(db);
    await expect(generateListingContent({ supabase, userId: "someone-else" }, "b1", "generic")).rejects.toMatchObject({ code: "not_found" });
  });

  it("provider failure aborts generation with a ListingGenerationServiceError", async () => {
    const db = baseDb();
    db.bundle_items = [{ bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: false }];
    const supabase = makeFakeSupabase(db);

    await expect(
      generateListingContent({ supabase, userId: "u1" }, "b1", "generic", { providerOverride: new FailingProvider() }),
    ).rejects.toBeInstanceOf(ListingGenerationServiceError);
  });

  it("invalid (empty) provider output is rejected, not silently accepted", async () => {
    const db = baseDb();
    db.bundle_items = [{ bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: false }];
    const supabase = makeFakeSupabase(db);

    await expect(
      generateListingContent({ supabase, userId: "u1" }, "b1", "generic", { providerOverride: new GarbageProvider() }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("is deterministic for the same bundle/marketplace with the mock provider", async () => {
    const db = baseDb();
    db.bundle_items = [{ bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: false }];
    const supabase = makeFakeSupabase(db);

    const a = await generateListingContent({ supabase, userId: "u1" }, "b1", "generic", { providerOverride: new MockTextProvider() });
    const b = await generateListingContent({ supabase, userId: "u1" }, "b1", "generic", { providerOverride: new MockTextProvider() });
    expect(a.title).toBe(b.title);
    expect(a.tags).toEqual(b.tags);
  });
});

describe("generateListingSection", () => {
  it("generates exactly the requested section", async () => {
    const db = baseDb();
    db.bundle_items = [{ bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: false }];
    const supabase = makeFakeSupabase(db);

    const titleResult = await generateListingSection({ supabase, userId: "u1" }, "b1", "generic", "title", { providerOverride: new MockTextProvider() });
    expect(titleResult.section).toBe("title");
    if (titleResult.section === "title") expect(titleResult.title.length).toBeGreaterThan(0);

    const tagsResult = await generateListingSection({ supabase, userId: "u1" }, "b1", "generic", "tags", { providerOverride: new MockTextProvider() });
    expect(tagsResult.section).toBe("tags");
    if (tagsResult.section === "tags") expect(tagsResult.tags.length).toBeGreaterThan(0);
  });

  it("a single-section provider failure throws without needing the other sections", async () => {
    const db = baseDb();
    db.bundle_items = [{ bundle_id: "b1", user_id: "u1", design_id: "d1", include_png: true, include_svg: false }];
    const supabase = makeFakeSupabase(db);

    await expect(
      generateListingSection({ supabase, userId: "u1" }, "b1", "generic", "description", { providerOverride: new FailingProvider() }),
    ).rejects.toBeInstanceOf(ListingGenerationServiceError);
  });
});
