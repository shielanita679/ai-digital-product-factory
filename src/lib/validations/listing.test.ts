import { describe, it, expect } from "vitest";

import {
  normalizeTagList,
  buildGeneratedTitleSchema,
  buildGeneratedDescriptionSchema,
  buildGeneratedTagsSchema,
  buildGeneratedKeywordsSchema,
  generateListingSchema,
  updateListingSchema,
  updateLicenseTextSchema,
} from "@/lib/validations/listing";
import { marketplaceLimits } from "@/config/marketplaces";

describe("normalizeTagList", () => {
  it("splits, trims, and drops empty entries", () => {
    expect(normalizeTagList("cute, , stickers ,  planner", 10, 30)).toEqual(["cute", "stickers", "planner"]);
  });

  it("dedupes case-insensitively", () => {
    expect(normalizeTagList("Cute, cute, CUTE, stickers", 10, 30)).toEqual(["Cute", "stickers"]);
  });

  it("caps at maxCount", () => {
    expect(normalizeTagList("a,b,c,d,e", 3, 30)).toEqual(["a", "b", "c"]);
  });

  it("truncates each tag to maxLength", () => {
    expect(normalizeTagList("a-very-long-tag-name", 10, 5)).toEqual(["a-ver"]);
  });
});

describe("buildGeneratedTitleSchema", () => {
  const schema = buildGeneratedTitleSchema(marketplaceLimits.etsy);

  it("normalizes whitespace", () => {
    expect(schema.parse("  Cute   Cat   Stickers  ")).toBe("Cute Cat Stickers");
  });

  it("rejects empty output", () => {
    expect(() => schema.parse("   ")).toThrow();
  });

  it("rejects output exceeding the marketplace's title limit", () => {
    expect(() => schema.parse("x".repeat(200))).toThrow();
  });
});

describe("buildGeneratedDescriptionSchema", () => {
  it("rejects empty output", () => {
    const schema = buildGeneratedDescriptionSchema(marketplaceLimits.generic);
    expect(() => schema.parse("")).toThrow();
  });

  it("accepts multi-line content within the limit", () => {
    const schema = buildGeneratedDescriptionSchema(marketplaceLimits.generic);
    const text = "Line one.\n\nLine two.";
    expect(schema.parse(text)).toBe(text);
  });
});

describe("buildGeneratedTagsSchema", () => {
  it("parses a comma-separated string into a normalized array respecting the marketplace's limits", () => {
    const schema = buildGeneratedTagsSchema(marketplaceLimits.etsy);
    const result = schema.parse("cute, stickers, cute, planner, a-tag-that-is-way-too-long-for-etsy");
    expect(result).toContain("cute");
    expect(result).toContain("stickers");
    expect(result).toContain("planner");
    expect(new Set(result).size).toBe(result.length);
    for (const tag of result) expect(tag.length).toBeLessThanOrEqual(marketplaceLimits.etsy.tagMaxLength);
    expect(result.length).toBeLessThanOrEqual(marketplaceLimits.etsy.maxTags);
  });
});

describe("buildGeneratedKeywordsSchema", () => {
  it("parses and normalizes like tags but independently of the tags schema", () => {
    const schema = buildGeneratedKeywordsSchema(marketplaceLimits.generic);
    const result = schema.parse("instant download, digital file, instant download");
    expect(result).toEqual(["instant download", "digital file"]);
  });
});

describe("generateListingSchema", () => {
  it("defaults marketplace to generic and confirmOverwriteEdits to false", () => {
    const parsed = generateListingSchema.parse({ bundleId: "11111111-1111-1111-1111-111111111111" });
    expect(parsed.marketplace).toBe("generic");
    expect(parsed.confirmOverwriteEdits).toBe(false);
  });

  it("rejects a non-uuid bundleId", () => {
    expect(generateListingSchema.safeParse({ bundleId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects an unknown marketplace", () => {
    expect(generateListingSchema.safeParse({ bundleId: "11111111-1111-1111-1111-111111111111", marketplace: "amazon" }).success).toBe(false);
  });
});

describe("updateListingSchema", () => {
  it("accepts a partial update with only some fields present", () => {
    const parsed = updateListingSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", title: "New title" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const parsed = updateListingSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", title: "" });
    expect(parsed.success).toBe(false);
  });

  // Phase 13 security fix: a manual edit had no upper bound at all, unlike
  // the AI-generation path (capped by marketplace limits) — an oversized
  // client-submitted edit could inflate buildPackage's in-memory ZIP-entry
  // content before MAX_PACKAGE_ZIP_BYTES ever caught it.
  it("rejects an oversized title (> 200 chars)", () => {
    const parsed = updateListingSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", title: "x".repeat(201) });
    expect(parsed.success).toBe(false);
  });

  it("rejects an oversized description (> 5000 chars)", () => {
    const parsed = updateListingSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", description: "x".repeat(5001) });
    expect(parsed.success).toBe(false);
  });

  it("rejects an oversized individual tag (> 50 chars), not just an oversized list", () => {
    const parsed = updateListingSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", tags: ["x".repeat(51)] });
    expect(parsed.success).toBe(false);
  });

  it("accepts a title/description/tag right at the boundary", () => {
    const parsed = updateListingSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      title: "x".repeat(200),
      description: "x".repeat(5000),
      tags: ["x".repeat(50)],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("updateLicenseTextSchema", () => {
  it("accepts normal license text", () => {
    const parsed = updateLicenseTextSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", licenseText: "You may use this for personal projects." });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty license text", () => {
    const parsed = updateLicenseTextSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", licenseText: "" });
    expect(parsed.success).toBe(false);
  });

  // Phase 13 security fix: previously unbounded, and license_text is
  // embedded verbatim into the package ZIP's license.txt.
  it("rejects oversized license text (> 20000 chars)", () => {
    const parsed = updateLicenseTextSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", licenseText: "x".repeat(20001) });
    expect(parsed.success).toBe(false);
  });

  it("accepts license text right at the boundary", () => {
    const parsed = updateLicenseTextSchema.safeParse({ id: "11111111-1111-1111-1111-111111111111", licenseText: "x".repeat(20000) });
    expect(parsed.success).toBe(true);
  });
});
