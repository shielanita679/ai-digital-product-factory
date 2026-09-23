import { describe, it, expect } from "vitest";

import { slugify, bundleSlug, packageFileName, designBaseFilename, mockupStableName, buildMockupFilenames } from "@/lib/packages/filename-utils";

describe("slugify", () => {
  it("lowercases, collapses non-alphanumerics to hyphens, trims edges", () => {
    expect(slugify("Cute Sticker Pack!!")).toBe("cute-sticker-pack");
  });

  it("strips diacritics", () => {
    expect(slugify("Café Décor")).toBe("cafe-decor");
  });

  it("falls back to 'file' when nothing survives (pure emoji/punctuation)", () => {
    expect(slugify("🎉🎉🎉")).toBe("file");
    expect(slugify("   ")).toBe("file");
  });

  it("truncates to maxLength", () => {
    expect(slugify("a".repeat(100), 10)).toHaveLength(10);
  });
});

describe("packageFileName", () => {
  it("uses just the bundle slug for the generic marketplace", () => {
    expect(packageFileName("Cute Sticker Pack", "generic")).toBe("cute-sticker-pack.zip");
  });

  it("suffixes non-generic marketplaces", () => {
    expect(packageFileName("Cute Sticker Pack", "etsy")).toBe("cute-sticker-pack-etsy.zip");
  });

  it("bundleSlug and packageFileName's base agree (same root folder / same download name base)", () => {
    expect(packageFileName("My Bundle", "generic")).toBe(`${bundleSlug("My Bundle")}.zip`);
  });
});

describe("designBaseFilename — collision-safe by construction", () => {
  it("numbers with a zero-padded prefix wide enough for the total count", () => {
    expect(designBaseFilename(0, 12, "Cat")).toBe("01-cat");
    expect(designBaseFilename(11, 12, "Cat")).toBe("12-cat");
  });

  it("two designs with the IDENTICAL title never collide — the sequence prefix alone guarantees uniqueness", () => {
    const a = designBaseFilename(0, 2, "Christmas Cat");
    const b = designBaseFilename(1, 2, "Christmas Cat");
    expect(a).not.toBe(b);
    expect(a).toBe("01-christmas-cat");
    expect(b).toBe("02-christmas-cat");
  });

  it("widens the zero-padding for 100+ designs", () => {
    expect(designBaseFilename(0, 150, "Cat")).toBe("001-cat");
  });
});

describe("mockupStableName — explicit map, not a mechanical kebab-case", () => {
  it("matches the Phase 10 spec's own example filenames exactly", () => {
    expect(mockupStableName("tshirt")).toBe("tshirt");
    expect(mockupStableName("mug")).toBe("mug");
    expect(mockupStableName("tote_bag")).toBe("tote-bag");
    expect(mockupStableName("wall_art")).toBe("wall-art-poster");
    expect(mockupStableName("sticker_sheet")).toBe("sticker-sheet");
    expect(mockupStableName("digital_bundle_preview")).toBe("digital-bundle-preview");
  });
});

describe("buildMockupFilenames — collision handling across designs", () => {
  it("uses the bare stable name when only one design has that template", () => {
    const names = buildMockupFilenames([{ templateType: "tshirt", designIndex: 0 }]);
    expect(names).toEqual(["tshirt.png"]);
  });

  it("prefixes with the design's own sequence number when MULTIPLE designs share a template (the exact collision case)", () => {
    const names = buildMockupFilenames([
      { templateType: "tshirt", designIndex: 0 },
      { templateType: "tshirt", designIndex: 1 },
    ]);
    expect(names).toEqual(["01-tshirt.png", "02-tshirt.png"]);
    expect(new Set(names).size).toBe(2);
  });

  it("only prefixes the colliding template, leaving a non-colliding template on the same design bare", () => {
    const names = buildMockupFilenames([
      { templateType: "tshirt", designIndex: 0 },
      { templateType: "tshirt", designIndex: 1 },
      { templateType: "mug", designIndex: 0 },
    ]);
    expect(names).toEqual(["01-tshirt.png", "02-tshirt.png", "mug.png"]);
  });
});
