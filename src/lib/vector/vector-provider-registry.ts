import type { VectorProvider } from "@/lib/vector/vector-provider";
import { MockVectorProvider } from "@/lib/vector/providers/mock-vector-provider";

export class UnsupportedVectorProviderError extends Error {
  constructor(configured: string) {
    super(`Unsupported VECTOR_PROVIDER "${configured}". Supported values: "mock".`);
    this.name = "UnsupportedVectorProviderError";
  }
}

export class VectorProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorProviderConfigurationError";
  }
}

/**
 * Server-side provider selection, driven by `VECTOR_PROVIDER` (default:
 * "mock") — mirrors `getImageProvider()` in `provider-registry.ts`. Phase
 * 7 deliberately implements only the mock case: no real vectorization
 * vendor is integrated yet, so there is no credential-requiring branch to
 * misconfigure. When a real provider is added later it follows the same
 * pattern as `getImageProvider()`'s "openai" case — read its required env
 * var here, throw `VectorProviderConfigurationError` if missing, and
 * never fall back to mock silently. An unsupported value fails loudly
 * instead of silently choosing any provider, paid or otherwise.
 */
export function getVectorProvider(): VectorProvider {
  const configured = (process.env.VECTOR_PROVIDER || "mock").trim().toLowerCase();

  switch (configured) {
    case "mock":
      return new MockVectorProvider();
    default:
      throw new UnsupportedVectorProviderError(configured);
  }
}
