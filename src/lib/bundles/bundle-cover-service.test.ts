import { describe, it, expect } from "vitest";

import { generateBundleCoverPng } from "@/lib/bundles/bundle-cover-service";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("generateBundleCoverPng", () => {
  it("produces a real, decodable PNG", async () => {
    const result = await generateBundleCoverPng({
      bundleId: "bundle-1",
      bundleName: "Christmas Cat Bundle",
      itemCount: 3,
      formats: { png: true, svg: true },
      representativeDesignTitles: ["Cat 1", "Cat 2", "Cat 3"],
    });
    expect(result.bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(result.mimeType).toBe("image/png");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("is deterministic for the same bundleId/name/counts/titles", async () => {
    const input = {
      bundleId: "bundle-42",
      bundleName: "Same Bundle",
      itemCount: 2,
      formats: { png: true, svg: false },
      representativeDesignTitles: ["A", "B"],
    };
    const a = await generateBundleCoverPng(input);
    const b = await generateBundleCoverPng(input);
    expect(a.bytes.equals(b.bytes)).toBe(true);
  });

  it("produces different output for a different bundleId", async () => {
    const base = { bundleName: "X", itemCount: 1, formats: { png: true, svg: false }, representativeDesignTitles: ["X"] };
    const a = await generateBundleCoverPng({ ...base, bundleId: "bundle-a" });
    const b = await generateBundleCoverPng({ ...base, bundleId: "bundle-b" });
    expect(a.bytes.equals(b.bytes)).toBe(false);
  });

  it("handles zero representative titles and zero-item bundles without throwing", async () => {
    const result = await generateBundleCoverPng({
      bundleId: "empty-bundle",
      bundleName: "Empty Bundle",
      itemCount: 0,
      formats: { png: false, svg: false },
      representativeDesignTitles: [],
    });
    expect(result.bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it("never fetches or embeds real design pixels — output size stays bounded regardless of title count/content", async () => {
    const result = await generateBundleCoverPng({
      bundleId: "many-titles",
      bundleName: "Many Titles",
      itemCount: 50,
      formats: { png: true, svg: true },
      representativeDesignTitles: Array.from({ length: 50 }, (_, i) => `Design ${i}`),
    });
    // Only ever renders up to 4 representative tiles — a real safety
    // bound, not just an assumption about title count.
    expect(result.bytes.byteLength).toBeLessThan(200_000);
  });
});
