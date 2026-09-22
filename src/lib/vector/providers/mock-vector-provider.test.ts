import { describe, it, expect } from "vitest";

import { MockVectorProvider } from "@/lib/vector/providers/mock-vector-provider";
import { validateAndSanitizeSvg } from "@/lib/vector/svg-validate";

describe("MockVectorProvider", () => {
  const provider = new MockVectorProvider();

  it("declares its capabilities honestly (deterministic, no real color-limit/simplify support)", () => {
    expect(provider.capabilities).toEqual({
      supportsColorLimit: false,
      supportsSimplifySetting: false,
      isDeterministic: true,
    });
  });

  it("produces genuine vector geometry that passes the real validation pipeline", async () => {
    const result = await provider.vectorize({
      designId: "design-1",
      raster: { bytes: Buffer.from("fake-png-bytes"), mimeType: "image/png", width: 1024, height: 1024 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const validation = validateAndSanitizeSvg(result.svg);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.metadata.hasEmbeddedRaster).toBe(false);
    expect(validation.metadata.pathCount).toBeGreaterThan(0);
    expect(validation.metadata.shapeCount).toBeGreaterThan(0);
  });

  it("never embeds the source raster bytes or a data:image URI referencing them", async () => {
    const result = await provider.vectorize({
      designId: "design-1",
      raster: { bytes: Buffer.from("fake-png-bytes"), mimeType: "image/png", width: 512, height: 512 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toMatch(/<image/i);
    expect(result.svg).not.toMatch(/data:image\//i);
  });

  it("is deterministic: the same designId + dimensions produce byte-identical output", async () => {
    const input = { designId: "design-42", raster: { bytes: Buffer.from("a"), mimeType: "image/png", width: 800, height: 600 } };
    const a = await provider.vectorize(input);
    const b = await provider.vectorize(input);
    expect(a).toEqual(b);
  });

  it("produces visibly different output for a different designId", async () => {
    const a = await provider.vectorize({ designId: "design-1", raster: { bytes: Buffer.from("a"), mimeType: "image/png", width: 512, height: 512 } });
    const b = await provider.vectorize({ designId: "design-2", raster: { bytes: Buffer.from("a"), mimeType: "image/png", width: 512, height: 512 } });
    expect(a.ok && b.ok && a.svg).not.toEqual(b.ok && b.svg);
  });

  it("honestly labels itself as a development preview in providerMetadata, never claiming to be a real vectorization", async () => {
    const result = await provider.vectorize({
      designId: "design-1",
      raster: { bytes: Buffer.from("a"), mimeType: "image/png", width: 512, height: 512 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.providerMetadata?.mock).toBe(true);
    expect(String(result.providerMetadata?.note)).toMatch(/not a real vectorization/i);
  });
});
