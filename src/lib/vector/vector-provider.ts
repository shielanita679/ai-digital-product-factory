/**
 * Provider-independent vectorization contract — mirrors the shape of
 * `src/lib/ai/image-provider.ts` so the two provider families read the
 * same way. The application (vectorize-service.ts) depends only on this
 * interface, never on a specific vendor SDK; swapping the mock provider
 * for a real one later means writing a new class that implements this and
 * registering it in `vector-provider-registry.ts` — nothing else changes.
 *
 * IMPORTANT: `VectorizationResult.svg` is the provider's RAW, UNTRUSTED
 * output. It is never persisted, served, or rendered as-is — every result
 * must pass through `validateAndSanitizeSvg` (svg-validate.ts) before the
 * vectorize service will store it. This file only describes what a
 * provider hands back, not what the app is allowed to keep.
 */

export type VectorizationSettings = {
  /** Upper bound a provider may target when reducing the palette. Advisory — the mock provider ignores it (it draws a fixed small palette by construction). */
  maxColors?: number;
  /** Path/detail simplification a provider may honor. Advisory for the same reason as maxColors. */
  simplify?: "low" | "medium" | "high";
};

export type VectorizationInput = {
  /** Used only to seed deterministic mock/dev output — never sent to a real provider as an identifier of anything sensitive. */
  designId: string;
  raster: {
    bytes: Buffer;
    mimeType: string;
    width: number;
    height: number;
  };
  settings?: VectorizationSettings;
};

type VectorizationSuccessBase = {
  ok: true;
  /** Raw SVG text straight from the provider — untrusted, unvalidated. See the module doc comment above. */
  svg: string;
  providerName: string;
  providerVectorizationId: string;
  /** What the provider actually did, which may differ from what was requested — never assumed to equal the input settings. */
  settingsApplied: VectorizationSettings;
  /** Sanitized, non-sensitive fields only — never raw headers, keys, or full provider response bodies. */
  providerMetadata?: Record<string, unknown>;
};

export type VectorizationSuccess = VectorizationSuccessBase;

export type VectorizationFailure = {
  ok: false;
  errorMessage: string;
  providerMetadata?: Record<string, unknown>;
};

export type VectorizationResult = VectorizationSuccess | VectorizationFailure;

/**
 * What a provider actually supports, so the vectorize service (and UI) can
 * adapt without scattering vendor-specific conditionals everywhere.
 */
export type VectorProviderCapabilities = {
  supportsColorLimit: boolean;
  supportsSimplifySetting: boolean;
  /** True for the mock provider (same input always produces the same output) — real providers should normally report false. */
  isDeterministic: boolean;
};

/** Provider-level failure (misconfiguration, construction-time errors) — distinct from a per-call VectorizationFailure result. */
export class VectorProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorProviderError";
  }
}

export interface VectorProvider {
  readonly name: string;
  readonly capabilities: VectorProviderCapabilities;
  vectorize(input: VectorizationInput): Promise<VectorizationResult>;
}
