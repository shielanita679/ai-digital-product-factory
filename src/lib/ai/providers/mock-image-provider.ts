import type {
  ImageGenerationProvider,
  ImageGenerationInput,
  ImageGenerationResult,
} from "@/lib/ai/image-provider";

/**
 * A plain polynomial hash alone leaves sequential seeds (e.g.
 * `${projectId}:${jobId}:0`, `:1`, `:2`, ...  — exactly the seed shape this
 * provider is actually called with) only one apart, which visibly showed
 * up as a slow hue/shape drift across a gallery instead of genuinely
 * distinct-looking previews. The avalanche finalizer below (MurmurHash3's
 * fmix32) spreads small input differences across the whole output range.
 */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(hash, 31) + input.charCodeAt(i)) | 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Truncates for the on-preview label only — never affects the stored title/prompt. */
function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const SHAPES = ["circle", "hexagon", "star", "triangle", "roundedSquare"] as const;

function shapeMarkup(shape: (typeof SHAPES)[number], cx: number, cy: number, r: number, fill: string): string {
  switch (shape) {
    case "circle":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`;
    case "roundedSquare":
      return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.3}" fill="${fill}" />`;
    case "triangle": {
      const points = [
        [cx, cy - r],
        [cx + r * 0.87, cy + r * 0.5],
        [cx - r * 0.87, cy + r * 0.5],
      ]
        .map((p) => p.join(","))
        .join(" ");
      return `<polygon points="${points}" fill="${fill}" />`;
    }
    case "star": {
      const points: string[] = [];
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? r : r * 0.45;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        points.push(`${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`);
      }
      return `<polygon points="${points.join(" ")}" fill="${fill}" />`;
    }
    case "hexagon": {
      const points: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      return `<polygon points="${points.join(" ")}" fill="${fill}" />`;
    }
  }
}

/**
 * Renders a small, deterministic SVG "development preview" from the
 * design's own title/variation/prompt — NOT an AI-generated image. Every
 * result is visually distinct (shape, hue, and label all vary with the
 * seed) so a gallery of these is actually useful for testing UX, not a
 * wall of identical gray boxes. The MOCK PREVIEW ribbon is baked into the
 * artwork itself so it can never be mistaken for a real generated asset,
 * even if metadata is stripped somewhere downstream.
 */
function renderMockPreviewSvg(input: {
  title: string;
  variationIndex: number;
  prompt: string;
  width: number;
  height: number;
  transparentBackground: boolean;
  seed: string;
}): string {
  const hash = hashString(input.seed);
  const shape = SHAPES[hash % SHAPES.length];
  const hue = hash % 360;
  const fill = `hsl(${hue}, 62%, 58%)`;
  const bgFill = `hsl(${hue}, 45%, 94%)`;

  // Keep the rendered canvas compact regardless of the requested reference
  // size — this is a UI preview, not the final asset dimensions.
  const aspect = input.width / input.height;
  const viewHeight = 400;
  const viewWidth = Math.round(viewHeight * aspect);
  const cx = viewWidth / 2;
  const cy = viewHeight / 2 - 20;
  const r = Math.min(viewWidth, viewHeight) * 0.22;

  const background = input.transparentBackground
    ? `<pattern id="t" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#f3f4f6" /><rect width="10" height="10" fill="#e5e7eb" /><rect x="10" y="10" width="10" height="10" fill="#e5e7eb" /></pattern><rect width="100%" height="100%" fill="url(#t)" />`
    : `<rect width="100%" height="100%" fill="${bgFill}" />`;

  const title = escapeXml(truncate(input.title, 34));
  const promptSummary = escapeXml(truncate(input.prompt, 46));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" width="${viewWidth}" height="${viewHeight}">
  ${background}
  <g>${shapeMarkup(shape, cx, cy, r, fill)}</g>
  <rect x="10" y="10" width="86" height="26" rx="13" fill="rgba(17,17,17,0.78)" />
  <text x="53" y="28" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">#${input.variationIndex + 1}</text>
  <rect x="0" y="${viewHeight - 74}" width="${viewWidth}" height="74" fill="rgba(17,17,17,0.82)" />
  <text x="16" y="${viewHeight - 48}" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="#fff">${title}</text>
  <text x="16" y="${viewHeight - 28}" font-family="system-ui, sans-serif" font-size="11" fill="#d1d5db">${promptSummary}</text>
  <text x="16" y="${viewHeight - 10}" font-family="system-ui, sans-serif" font-size="10" font-weight="700" letter-spacing="1" fill="#fbbf24">MOCK PREVIEW — NOT AI-GENERATED</text>
</svg>`;
}

export type MockImageProviderOptions = {
  /**
   * Dev/test-only hook: 1-based variation numbers to force into failure,
   * so partial-failure states can be exercised deterministically. Nothing
   * in the normal "Generate Designs" action path ever sets this for a real
   * user — see `src/lib/generation/generation-service.ts`.
   */
  forceFailVariationNumbers?: number[];
};

export class MockImageProvider implements ImageGenerationProvider {
  readonly name = "mock";
  readonly capabilities = {
    supportsNegativePrompt: true,
    // The mock renders its own checkerboard-vs-solid preview, so it can
    // "honor" transparency/aspect intent perfectly by construction — real
    // providers report their actual, narrower capabilities.
    supportsTransparentBackground: true,
    supportsAspectRatio: true,
    supportsSeed: true,
    supportsMultipleOutputs: false,
  };

  constructor(private readonly options: MockImageProviderOptions = {}) {}

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const variationNumber = input.variationIndex + 1;

    if (this.options.forceFailVariationNumbers?.includes(variationNumber)) {
      return {
        ok: false,
        errorMessage: `Mock provider: simulated failure for variation ${variationNumber} (development failure simulation).`,
        providerMetadata: { mock: true, simulatedFailure: true },
      };
    }

    const svg = renderMockPreviewSvg({
      title: input.title,
      variationIndex: input.variationIndex,
      prompt: input.prompt,
      width: input.dimensions.width,
      height: input.dimensions.height,
      transparentBackground: input.transparentBackground,
      seed: input.seed,
    });
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

    return {
      ok: true,
      source: "inline",
      imageUrl: dataUri,
      thumbnailUrl: dataUri,
      width: input.dimensions.width,
      height: input.dimensions.height,
      mimeType: "image/svg+xml",
      // Honest, not assumed: the mock renderer actually draws a checkerboard
      // vs. a solid fill depending on this flag, so what it reports matches
      // what it drew.
      transparentBackgroundApplied: input.transparentBackground,
      providerGenerationId: `mock_${hashString(input.seed).toString(16)}`,
      providerMetadata: {
        mock: true,
        note: "Development preview only — not a real AI-generated design.",
      },
    };
  }
}
