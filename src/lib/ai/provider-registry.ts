import type { ImageGenerationProvider } from "@/lib/ai/image-provider";
import { MockImageProvider } from "@/lib/ai/providers/mock-image-provider";

export class UnsupportedProviderError extends Error {
  constructor(configured: string) {
    super(
      `Unsupported AI_IMAGE_PROVIDER "${configured}". Only "mock" is available until a real provider is added in Phase 6.`,
    );
    this.name = "UnsupportedProviderError";
  }
}

/**
 * Server-side provider selection, driven by `AI_IMAGE_PROVIDER` (default:
 * "mock"). Never reads a `NEXT_PUBLIC_*` variable — provider credentials
 * must never reach the browser bundle. An unsupported value fails loudly
 * with a clear server error instead of silently falling back to a paid
 * provider.
 */
export function getImageProvider(): ImageGenerationProvider {
  const configured = (process.env.AI_IMAGE_PROVIDER || "mock").trim().toLowerCase();

  switch (configured) {
    case "mock":
      return new MockImageProvider();
    default:
      throw new UnsupportedProviderError(configured);
  }
}
