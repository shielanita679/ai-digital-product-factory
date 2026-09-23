import { describe, it, expect } from "vitest";

import { MockTextProvider } from "@/lib/ai/providers/mock-text-provider";

const provider = new MockTextProvider();

const baseContext = {
  bundleId: "bundle-1",
  marketplace: "etsy",
  bundleName: "Cute Cat Stickers",
  productType: "Sticker Pack",
  originalIdea: "Cute cat stickers for planners",
  styles: ["cute"],
  targetAudience: ["planner enthusiasts"],
  designCount: 5,
  designTitles: ["Cat 1", "Cat 2"],
  includesPng: true,
  includesSvg: false,
  titleMaxLength: 140,
  descriptionMaxLength: 5000,
  maxTags: 13,
  tagMaxLength: 20,
  maxKeywords: 13,
  keywordMaxLength: 20,
};

describe("MockTextProvider — generic fallback (Phase 5 behavior preserved)", () => {
  it("normalizes whitespace on the instruction when no listing task is given", async () => {
    const result = await provider.generateText({ instruction: "  hello   world  " });
    expect(result).toEqual({ ok: true, text: "hello world" });
  });

  it("rejects an empty instruction", async () => {
    const result = await provider.generateText({ instruction: "   " });
    expect(result.ok).toBe(false);
  });
});

describe("MockTextProvider — listing_title", () => {
  it("produces a non-empty title containing the bundle name and product type", async () => {
    const result = await provider.generateText({ instruction: "title", context: { ...baseContext, task: "listing_title" } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.text).toContain("Cute Cat Stickers");
      expect(result.text).toContain("Sticker Pack");
    }
  });

  it("respects titleMaxLength", async () => {
    const result = await provider.generateText({
      instruction: "title",
      context: { ...baseContext, task: "listing_title", titleMaxLength: 20, bundleName: "A Very Long Bundle Name That Overflows" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text.length).toBeLessThanOrEqual(20);
  });

  it("is deterministic for the same bundleId/marketplace", async () => {
    const a = await provider.generateText({ instruction: "title", context: { ...baseContext, task: "listing_title" } });
    const b = await provider.generateText({ instruction: "title", context: { ...baseContext, task: "listing_title" } });
    expect(a).toEqual(b);
  });

  it("produces different output for a different bundleId", async () => {
    const a = await provider.generateText({ instruction: "title", context: { ...baseContext, task: "listing_title", bundleId: "bundle-a" } });
    const b = await provider.generateText({ instruction: "title", context: { ...baseContext, task: "listing_title", bundleId: "bundle-b" } });
    expect(a).not.toEqual(b);
  });
});

describe("MockTextProvider — listing_description", () => {
  it("includes format-honest sections — only mentions PNG when includesPng is true", async () => {
    const result = await provider.generateText({
      instruction: "description",
      context: { ...baseContext, task: "listing_description", includesPng: true, includesSvg: false },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("PNG");
      expect(result.text).not.toContain("SVG");
    }
  });

  it("mentions both formats only when both are actually included", async () => {
    const result = await provider.generateText({
      instruction: "description",
      context: { ...baseContext, task: "listing_description", includesPng: true, includesSvg: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("PNG");
      expect(result.text).toContain("SVG");
    }
  });

  it("includes the digital product notice", async () => {
    const result = await provider.generateText({ instruction: "description", context: { ...baseContext, task: "listing_description" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text.toLowerCase()).toContain("digital download");
  });

  it("respects descriptionMaxLength", async () => {
    const result = await provider.generateText({
      instruction: "description",
      context: { ...baseContext, task: "listing_description", descriptionMaxLength: 50 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text.length).toBeLessThanOrEqual(50);
  });
});

describe("MockTextProvider — listing_tags", () => {
  it("produces at most maxTags comma-separated tags, each within tagMaxLength", async () => {
    const result = await provider.generateText({
      instruction: "tags",
      context: { ...baseContext, task: "listing_tags", maxTags: 5, tagMaxLength: 15 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const tags = result.text.split(",").map((t) => t.trim()).filter(Boolean);
      expect(tags.length).toBeLessThanOrEqual(5);
      for (const tag of tags) expect(tag.length).toBeLessThanOrEqual(15);
    }
  });

  it("produces no duplicate tags", async () => {
    const result = await provider.generateText({ instruction: "tags", context: { ...baseContext, task: "listing_tags" } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const tags = result.text.split(",").map((t) => t.trim());
      expect(new Set(tags).size).toBe(tags.length);
    }
  });

  it("only mentions svg-related tags when includesSvg is true", async () => {
    const withoutSvg = await provider.generateText({
      instruction: "tags",
      context: { ...baseContext, task: "listing_tags", includesSvg: false, maxTags: 13 },
    });
    expect(withoutSvg.ok).toBe(true);
    if (withoutSvg.ok) expect(withoutSvg.text.toLowerCase()).not.toContain("svg");
  });
});

describe("MockTextProvider — listing_keywords", () => {
  it("produces at most maxKeywords comma-separated keywords, each within keywordMaxLength", async () => {
    const result = await provider.generateText({
      instruction: "keywords",
      context: { ...baseContext, task: "listing_keywords", maxKeywords: 4, keywordMaxLength: 25 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keywords = result.text.split(",").map((k) => k.trim()).filter(Boolean);
      expect(keywords.length).toBeLessThanOrEqual(4);
      for (const k of keywords) expect(k.length).toBeLessThanOrEqual(25);
    }
  });

  it("keywords differ from tags for the same context (not just an alias)", async () => {
    const tags = await provider.generateText({ instruction: "tags", context: { ...baseContext, task: "listing_tags" } });
    const keywords = await provider.generateText({ instruction: "keywords", context: { ...baseContext, task: "listing_keywords" } });
    expect(tags.ok && keywords.ok && tags.text).not.toEqual(keywords.ok && keywords.text);
  });
});
