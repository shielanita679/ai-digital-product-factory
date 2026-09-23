import { describe, it, expect } from "vitest";

import { buildListingText, buildLicenseText } from "@/lib/packages/package-text-builder";

describe("buildListingText", () => {
  it("renders every section with the exact headings from the Phase 10 spec", () => {
    const text = buildListingText({
      title: "Cute Sticker Pack",
      description: "A fun set of stickers.",
      tags: ["cute", "stickers"],
      seoKeywords: ["sticker pack", "cute clipart"],
      includedFiles: ["PNG", "SVG"],
      materials: ["Digital file", "PNG file", "SVG file"],
    });
    expect(text).toContain("TITLE\n-----\n\nCute Sticker Pack");
    expect(text).toContain("DESCRIPTION\n-----------\n\nA fun set of stickers.");
    expect(text).toContain("TAGS\n----\n\ncute, stickers");
    expect(text).toContain("KEYWORDS\n--------\n\nsticker pack, cute clipart");
    expect(text).toContain("PRODUCT DETAILS\n---------------");
    expect(text).toContain("Formats included: PNG, SVG");
  });

  it("never fabricates content for missing fields", () => {
    const text = buildListingText({ title: null, description: null, tags: [], seoKeywords: [], includedFiles: [], materials: [] });
    expect(text).toContain("(untitled)");
    expect(text).toContain("(no description)");
    expect(text).toContain("(none)");
  });
});

describe("buildLicenseText", () => {
  it("passes the seller's saved license text through byte-for-byte, no regeneration", () => {
    const custom = "My completely custom hand-written license terms.\nSecond line.";
    expect(buildLicenseText(custom)).toBe(custom);
  });
});
