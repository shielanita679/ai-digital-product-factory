import type { Orientation } from "@/config/design-options";

/**
 * Provider-independent size/aspect representation. Orientation is the
 * durable, portable concept — width/height are reference pixel hints a
 * provider may reinterpret (or ignore) using its own supported sizes.
 */
export type NormalizedDimensions = {
  orientation: Orientation;
  aspectRatio: string;
  width: number;
  height: number;
};

export function normalizeDimensions(orientation: Orientation): NormalizedDimensions {
  switch (orientation) {
    case "portrait":
      return { orientation, aspectRatio: "3:4", width: 1024, height: 1365 };
    case "landscape":
      return { orientation, aspectRatio: "4:3", width: 1365, height: 1024 };
    case "square":
    default:
      return { orientation: "square", aspectRatio: "1:1", width: 1024, height: 1024 };
  }
}

export type ImageGenerationInput = {
  /** 0-based position of this design within its generation job. */
  variationIndex: number;
  title: string;
  prompt: string;
  /** Only meaningful when the provider reports `supportsNegativePrompt`. */
  negativePrompt: string | null;
  dimensions: NormalizedDimensions;
  /** Intent only — the result reports whether it was actually honored. */
  transparentBackground: boolean;
  /** Deterministic per-design seed (e.g. `${projectId}:${variationIndex}`) so a mock/dev provider can produce stable, reproducible output. */
  seed: string;
};

export type ImageGenerationSuccess = {
  ok: true;
  imageUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  mimeType: string;
  /** Honest report of whether the *result* has a transparent background — never assumed true just because it was requested. */
  transparentBackgroundApplied: boolean;
  providerGenerationId: string;
  providerMetadata?: Record<string, unknown>;
};

export type ImageGenerationFailure = {
  ok: false;
  errorMessage: string;
  providerMetadata?: Record<string, unknown>;
};

export type ImageGenerationResult = ImageGenerationSuccess | ImageGenerationFailure;

/**
 * The application depends only on this interface, never on a specific
 * vendor SDK. Swapping the mock provider for a real one in Phase 6 means
 * writing a new class that implements this and registering it in
 * `provider-registry.ts` — nothing else in the app changes.
 */
export interface ImageGenerationProvider {
  readonly name: string;
  /** Some providers (and some models) don't accept a negative prompt at all. */
  readonly supportsNegativePrompt: boolean;
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}
