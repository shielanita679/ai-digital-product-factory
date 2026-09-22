import { describe, it, expect } from "vitest";

import { MockImageProvider } from "@/lib/ai/providers/mock-image-provider";
import { normalizeDimensions, type ImageGenerationInput } from "@/lib/ai/image-provider";

function makeInput(overrides: Partial<ImageGenerationInput> = {}): ImageGenerationInput {
  return {
    variationIndex: 0,
    title: "Test Design",
    prompt: "A test prompt for the mock provider.",
    negativePrompt: "clutter, photorealistic background",
    dimensions: normalizeDimensions("square"),
    transparentBackground: true,
    seed: "project-1:job-1:0",
    ...overrides,
  };
}

describe("MockImageProvider", () => {
  it("never touches the network and requires no credentials to construct", () => {
    expect(() => new MockImageProvider()).not.toThrow();
  });

  it("generates a successful result with an inline data: URI preview", async () => {
    const provider = new MockImageProvider();
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.imageUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
      expect(result.mimeType).toBe("image/svg+xml");
    }
  });

  it("produces distinct output for different variations/seeds", async () => {
    const provider = new MockImageProvider();
    const a = await provider.generate(makeInput({ variationIndex: 0, seed: "p:j:0" }));
    const b = await provider.generate(makeInput({ variationIndex: 1, seed: "p:j:1" }));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.imageUrl).not.toBe(b.imageUrl);
      expect(a.providerGenerationId).not.toBe(b.providerGenerationId);
    }
  });

  it("processes a full batch matching the requested variation count", async () => {
    const provider = new MockImageProvider();
    const count = 10;
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) => provider.generate(makeInput({ variationIndex: i, seed: `p:j:${i}` }))),
    );
    expect(results).toHaveLength(count);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("simulates an explicit, deterministic failure only for configured variation numbers", async () => {
    const provider = new MockImageProvider({ forceFailVariationNumbers: [3] });

    const variation2 = await provider.generate(makeInput({ variationIndex: 1 })); // 1-based #2
    const variation3 = await provider.generate(makeInput({ variationIndex: 2 })); // 1-based #3

    expect(variation2.ok).toBe(true);
    expect(variation3.ok).toBe(false);
    if (!variation3.ok) {
      expect(variation3.errorMessage.length).toBeGreaterThan(0);
    }
  });

  it("never fails for normal use when no failure simulation is configured", async () => {
    const provider = new MockImageProvider();
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) => provider.generate(makeInput({ variationIndex: i }))),
    );
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("supports partial success across a batch when failure simulation targets some variations", async () => {
    const provider = new MockImageProvider({ forceFailVariationNumbers: [2, 5] });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => provider.generate(makeInput({ variationIndex: i }))),
    );
    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    expect(succeeded).toBe(4);
    expect(failed).toBe(2);
  });

  it("reports provider metadata marking the result as a mock, non-AI preview", async () => {
    const provider = new MockImageProvider();
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerMetadata).toMatchObject({ mock: true });
    }
  });

  it("honestly reports transparent-background metadata matching the request", async () => {
    const provider = new MockImageProvider();
    const transparent = await provider.generate(makeInput({ transparentBackground: true }));
    const opaque = await provider.generate(makeInput({ transparentBackground: false }));
    expect(transparent.ok && opaque.ok).toBe(true);
    if (transparent.ok && opaque.ok) {
      expect(transparent.transparentBackgroundApplied).toBe(true);
      expect(opaque.transparentBackgroundApplied).toBe(false);
    }
  });

  it("reports dimensions/aspect ratio matching the requested orientation", async () => {
    const provider = new MockImageProvider();
    const portrait = await provider.generate(makeInput({ dimensions: normalizeDimensions("portrait") }));
    expect(portrait.ok).toBe(true);
    if (portrait.ok) {
      expect(portrait.width).toBe(normalizeDimensions("portrait").width);
      expect(portrait.height).toBe(normalizeDimensions("portrait").height);
    }
  });

  it("declares negative-prompt support", () => {
    const provider = new MockImageProvider();
    expect(provider.supportsNegativePrompt).toBe(true);
  });
});
