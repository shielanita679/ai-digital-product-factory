import { describe, it, expect } from "vitest";

import { buildReadmeText } from "@/lib/packages/package-readme-builder";

describe("buildReadmeText — deterministic, factual, zero AI calls", () => {
  it("never claims a file type exists unless its count is actually greater than zero", () => {
    const text = buildReadmeText({ pngCount: 0, svgCount: 0, mockupCount: 0, hasCover: false, hasListing: false, hasLicense: false });
    expect(text).not.toMatch(/PNG file/);
    expect(text).not.toMatch(/SVG file/);
    expect(text).not.toMatch(/mockup/);
    expect(text).not.toMatch(/bundle preview/);
    expect(text).not.toMatch(/listing information/);
    expect(text).not.toContain("- license");
  });

  it("lists exactly the content that is actually present, correctly pluralized", () => {
    const text = buildReadmeText({ pngCount: 1, svgCount: 3, mockupCount: 2, hasCover: true, hasListing: true, hasLicense: true });
    expect(text).toContain("1 PNG file");
    expect(text).not.toContain("1 PNG files");
    expect(text).toContain("3 SVG files");
    expect(text).toContain("2 mockups");
    expect(text).toContain("bundle preview");
    expect(text).toContain("listing information");
    expect(text).toContain("license");
  });

  it("is perfectly deterministic — same input, byte-identical output, twice", () => {
    const input = { pngCount: 5, svgCount: 5, mockupCount: 1, hasCover: true, hasListing: false, hasLicense: false };
    expect(buildReadmeText(input)).toBe(buildReadmeText(input));
  });

  it("mentions this is a digital product package", () => {
    const text = buildReadmeText({ pngCount: 1, svgCount: 0, mockupCount: 0, hasCover: false, hasListing: false, hasLicense: false });
    expect(text).toMatch(/digital product package/i);
  });
});
