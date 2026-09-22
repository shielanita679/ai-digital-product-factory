import { describe, it, expect } from "vitest";

import { generateDesignPrompts, type PromptEngineProjectInput } from "@/lib/ai/prompt-engine";

const baseInput: PromptEngineProjectInput = {
  id: "11111111-1111-1111-1111-111111111111",
  userPrompt: "Create 10 funny Christmas cat SVG designs for Cricut",
  productType: "svg_bundle",
  styles: ["funny", "retro"],
  customStyle: null,
  targetAudience: ["pet_owners"],
  customAudience: null,
  requestedDesignCount: 10,
  contentMode: "text_and_graphics",
  colorMode: "no_preference",
  customColors: [],
  transparentBackground: true,
  orientation: "square",
  detailLevel: "medium",
};

describe("generateDesignPrompts", () => {
  it("produces exactly the requested number of prompts for a bundle", () => {
    const prompts = generateDesignPrompts(baseInput);
    expect(prompts).toHaveLength(10);
  });

  it("produces distinct prompts for each variation", () => {
    const prompts = generateDesignPrompts(baseInput);
    const uniquePrompts = new Set(prompts.map((p) => p.prompt));
    const uniqueTitles = new Set(prompts.map((p) => p.title));
    expect(uniquePrompts.size).toBe(prompts.length);
    expect(uniqueTitles.size).toBe(prompts.length);
  });

  it("keeps titles distinct up to the largest supported design count (30), for every content mode", () => {
    for (const contentMode of ["text_only", "graphics_only", "text_and_graphics"] as const) {
      const prompts = generateDesignPrompts({ ...baseInput, contentMode, requestedDesignCount: 30 });
      const uniqueTitles = new Set(prompts.map((p) => p.title));
      expect(uniqueTitles.size, `${contentMode} produced duplicate titles`).toBe(30);
    }
  });

  it("does not simply duplicate the same prompt N times", () => {
    const prompts = generateDesignPrompts(baseInput);
    expect(prompts[0].prompt).not.toBe(prompts[1].prompt);
  });

  it("produces stable, identical output for identical input (deterministic, no randomness)", () => {
    const first = generateDesignPrompts(baseInput);
    const second = generateDesignPrompts(baseInput);
    expect(second).toEqual(first);
  });

  it("forces exactly one prompt for single_svg regardless of requested_design_count", () => {
    const prompts = generateDesignPrompts({
      ...baseInput,
      productType: "single_svg",
      requestedDesignCount: 20,
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0].variationIndex).toBe(0);
  });

  it("text_only mode excludes illustration instructions and stays typography-focused", () => {
    const prompts = generateDesignPrompts({ ...baseInput, contentMode: "text_only", requestedDesignCount: 3 });
    for (const p of prompts) {
      expect(p.prompt).toContain("lettering");
      expect(p.prompt).toContain("no illustrated characters, objects, or scenery");
    }
  });

  it("graphics_only mode excludes text/lettering instructions", () => {
    const prompts = generateDesignPrompts({ ...baseInput, contentMode: "graphics_only", requestedDesignCount: 3 });
    for (const p of prompts) {
      expect(p.prompt).toContain("no text, letters, or words");
      expect(p.prompt.toLowerCase()).not.toContain("lettering");
    }
  });

  it("text_and_graphics mode combines illustration and typography", () => {
    const prompts = generateDesignPrompts({ ...baseInput, contentMode: "text_and_graphics", requestedDesignCount: 3 });
    for (const p of prompts) {
      expect(p.prompt).toMatch(/illustration/i);
      expect(p.prompt).toContain("spelling out a short related phrase");
    }
  });

  it("includes custom colors when color_mode is custom, and never invents colors", () => {
    const withCustom = generateDesignPrompts({
      ...baseInput,
      colorMode: "custom",
      customColors: ["sage green", "terracotta"],
      requestedDesignCount: 2,
    });
    for (const p of withCustom) {
      expect(p.prompt).toContain("sage green");
      expect(p.prompt).toContain("terracotta");
    }

    const withoutCustomColors = generateDesignPrompts({
      ...baseInput,
      colorMode: "custom",
      customColors: [],
      requestedDesignCount: 2,
    });
    for (const p of withoutCustomColors) {
      expect(p.prompt.toLowerCase()).not.toContain("color palette only");
    }
  });

  it("includes custom style text when provided", () => {
    const prompts = generateDesignPrompts({
      ...baseInput,
      customStyle: "Bold outlines, warm palette",
      requestedDesignCount: 2,
    });
    for (const p of prompts) {
      expect(p.prompt).toContain("Bold outlines, warm palette");
    }
  });

  it("includes custom audience text when provided", () => {
    const prompts = generateDesignPrompts({
      ...baseInput,
      customAudience: "Cat lovers",
      requestedDesignCount: 2,
    });
    for (const p of prompts) {
      expect(p.prompt).toContain("Cat lovers");
    }
  });

  it("maps orientation to the correct normalized dimensions", () => {
    const square = generateDesignPrompts({ ...baseInput, orientation: "square", requestedDesignCount: 1 });
    const portrait = generateDesignPrompts({ ...baseInput, orientation: "portrait", requestedDesignCount: 1 });
    const landscape = generateDesignPrompts({ ...baseInput, orientation: "landscape", requestedDesignCount: 1 });

    expect(square[0].dimensions.orientation).toBe("square");
    expect(square[0].dimensions.width).toBe(square[0].dimensions.height);

    expect(portrait[0].dimensions.orientation).toBe("portrait");
    expect(portrait[0].dimensions.height).toBeGreaterThan(portrait[0].dimensions.width);

    expect(landscape[0].dimensions.orientation).toBe("landscape");
    expect(landscape[0].dimensions.width).toBeGreaterThan(landscape[0].dimensions.height);
  });

  it("includes vector-friendly guidance and a negative prompt for SVG-oriented product types", () => {
    const prompts = generateDesignPrompts({ ...baseInput, productType: "svg_bundle", requestedDesignCount: 1 });
    expect(prompts[0].prompt).toContain("vector-friendly");
    expect(prompts[0].negativePrompt).not.toBeNull();
    expect(prompts[0].negativePrompt).toContain("photorealistic background");
  });

  it("omits vector-friendly guidance and negative prompt for non-vector product types", () => {
    const prompts = generateDesignPrompts({ ...baseInput, productType: "printable", requestedDesignCount: 1 });
    expect(prompts[0].prompt).not.toContain("vector-friendly");
    expect(prompts[0].negativePrompt).toBeNull();
  });

  it("tags every prompt with the current prompt-engine version", () => {
    const prompts = generateDesignPrompts({ ...baseInput, requestedDesignCount: 2 });
    for (const p of prompts) {
      expect(p.promptEngineVersion).toBe("v1");
    }
  });
});
