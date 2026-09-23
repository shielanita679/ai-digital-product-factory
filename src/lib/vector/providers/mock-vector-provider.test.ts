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

  it("every fill is a real #rrggbb color, never the literal string \"undefined\" — regression for a signed-vs-unsigned right-shift bug found in a live Phase 7 run", async () => {
    // The bug only manifested for hashes with the top bit set, which a
    // fixed small set of seeds may not happen to hit — sweep a wide
    // range of designIds/dimensions (including the exact live-run inputs
    // that first surfaced it) so this test reliably exercises both the
    // high-bit-set and high-bit-clear cases.
    const seeds = [
      { designId: "9f428ed6-8b5d-4f2a-96bb-50a4eb171a03", width: 1, height: 1 }, // the exact failing live case
      ...Array.from({ length: 50 }, (_, i) => ({ designId: `sweep-design-${i}`, width: 512, height: 512 })),
    ];

    for (const { designId, width, height } of seeds) {
      const result = await provider.vectorize({ designId, raster: { bytes: Buffer.from("a"), mimeType: "image/png", width, height } });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.svg).not.toMatch(/fill="undefined"/);
      const fillValues = [...result.svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
      expect(fillValues.length).toBeGreaterThan(0);
      for (const fill of fillValues) {
        expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});
