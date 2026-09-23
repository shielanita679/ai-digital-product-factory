/**
 * Provider-independent mockup contract — mirrors the shape of
 * src/lib/ai/image-provider.ts and src/lib/vector/vector-provider.ts so
 * all three provider families read the same way. The application
 * (mockup-service.ts) depends only on this interface, never on a
 * specific vendor SDK; swapping the mock provider for a real one later
 * means writing a new class that implements this and registering it in
 * mockup-provider-registry.ts — nothing else changes.
 */

export const MOCKUP_TEMPLATE_VALUES = ["tshirt", "mug", "tote_bag", "wall_art", "sticker_sheet", "digital_bundle_preview"] as const;
export type MockupTemplateType = (typeof MOCKUP_TEMPLATE_VALUES)[number];

export type MockupInput = {
  /** Used only to seed deterministic mock/dev output — never sent to a real provider as anything sensitive. */
  designId: string;
  bundleId: string;
  templateType: MockupTemplateType;
  /** The design's own display title, used for on-mockup labeling — never the raw prompt (which may be long/unstructured). */
  designTitle: string;
  /** The source raster the mockup conceptually composites — the mock provider only uses its dimensions/metadata, never the actual pixels (see MockMockupProvider's doc comment). */
  sourceRaster: {
    mimeType: string;
    width: number;
    height: number;
  };
};

type MockupSuccessBase = {
  ok: true;
  /** Raw PNG bytes — always a real, decodable raster image (rasterized server-side from deterministic vector drawing), never a placeholder that merely claims to be an image. */
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  providerName: string;
  providerMockupId: string;
  /** Sanitized, non-sensitive fields only — never raw headers, keys, or full provider response bodies. */
  metadata?: Record<string, unknown>;
};

export type MockupResult =
  | MockupSuccessBase
  | {
      ok: false;
      errorMessage: string;
      metadata?: Record<string, unknown>;
    };

export type MockupProviderCapabilities = {
  supportedTemplates: readonly MockupTemplateType[];
  /** True for the mock provider (same input always produces the same output) — real providers should normally report false. */
  isDeterministic: boolean;
  /** True if the provider composites the ACTUAL source design pixels (a real provider); the mock never does this — see MockMockupProvider. */
  usesSourceImagery: boolean;
};

/** Provider-level failure (misconfiguration, construction-time errors) — distinct from a per-call MockupResult failure. */
export class MockupProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockupProviderError";
  }
}

export interface MockupProvider {
  readonly name: string;
  readonly capabilities: MockupProviderCapabilities;
  generate(input: MockupInput): Promise<MockupResult>;
}
