import type { ImageGenerationProvider } from "@/lib/ai/image-provider";
import { MockImageProvider } from "@/lib/ai/providers/mock-image-provider";
import { OpenAIImageProvider } from "@/lib/ai/providers/openai-image-provider";

export class UnsupportedProviderError extends Error {
  constructor(configured: string) {
    super(`Unsupported AI_IMAGE_PROVIDER "${configured}". Supported values: "mock", "openai".`);
    this.name = "UnsupportedProviderError";
  }
}

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

/**
 * Server-side provider selection, driven by `AI_IMAGE_PROVIDER` (default:
 * "mock"). Never reads a `NEXT_PUBLIC_*` variable — provider credentials
 * must never reach the browser bundle. An unsupported value, or a real
 * provider selected without its required credential, fails loudly with a
 * clear server error instead of silently falling back to (or silently
 * using) a paid provider.
 */
export function getImageProvider(): ImageGenerationProvider {
  const configured = (process.env.AI_IMAGE_PROVIDER || "mock").trim().toLowerCase();

  switch (configured) {
    case "mock":
      return new MockImageProvider();
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new ProviderConfigurationError(
          'AI_IMAGE_PROVIDER is set to "openai" but OPENAI_API_KEY is not configured on the server. Set OPENAI_API_KEY in your server environment (never NEXT_PUBLIC_*) and restart the server.',
        );
      }
      return new OpenAIImageProvider(apiKey);
    }
    default:
      throw new UnsupportedProviderError(configured);
  }
}
