import { describe, it, expect } from "vitest";

import { MockMockupProvider } from "@/lib/mockups/providers/mock-mockup-provider";
import { MOCKUP_TEMPLATE_VALUES } from "@/lib/mockups/mockup-provider";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("MockMockupProvider", () => {
  const provider = new MockMockupProvider();

  it("declares its capabilities honestly (deterministic, never uses the actual source imagery)", () => {
    expect(provider.capabilities.isDeterministic).toBe(true);
    expect(provider.capabilities.usesSourceImagery).toBe(false);
    expect(provider.capabilities.supportedTemplates).toEqual(MOCKUP_TEMPLATE_VALUES);
  });

  it("produces a real, decodable PNG for every supported template", async () => {
    for (const templateType of MOCKUP_TEMPLATE_VALUES) {
      const result = await provider.generate({
        designId: "design-1",
        bundleId: "bundle-1",
        templateType,
        designTitle: "A cute test design",
        sourceRaster: { mimeType: "image/png", width: 1024, height: 1024 },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
      expect(result.mimeType).toBe("image/png");
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    }
  });

  it("is deterministic: same bundle/design/template produces byte-identical output", async () => {
    const input = { designId: "design-1", bundleId: "bundle-1", templateType: "mug" as const, designTitle: "Same title", sourceRaster: { mimeType: "image/png", width: 512, height: 512 } };
    const a = await provider.generate(input);
    const b = await provider.generate(input);
    expect(a).toEqual(b);
  });

  it("produces different output for a different template on the same design", async () => {
    const base = { designId: "design-1", bundleId: "bundle-1", designTitle: "T", sourceRaster: { mimeType: "image/png", width: 512, height: 512 } };
    const a = await provider.generate({ ...base, templateType: "tshirt" });
    const b = await provider.generate({ ...base, templateType: "mug" });
    expect(a.ok && b.ok && a.bytes.equals(b.bytes)).toBe(false);
  });

  it("honestly labels itself as a development mockup in metadata, never claiming photorealistic output", async () => {
    const result = await provider.generate({
      designId: "design-1",
      bundleId: "bundle-1",
      templateType: "sticker_sheet",
      designTitle: "T",
      sourceRaster: { mimeType: "image/png", width: 512, height: 512 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata?.mock).toBe(true);
    expect(String(result.metadata?.note)).toMatch(/not a real product photo/i);
  });
});
