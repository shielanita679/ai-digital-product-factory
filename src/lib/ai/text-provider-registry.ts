import type { TextProvider } from "@/lib/ai/text-provider";
import { MockTextProvider } from "@/lib/ai/providers/mock-text-provider";

export class UnsupportedTextProviderError extends Error {
  constructor(configured: string) {
    super(`Unsupported AI_TEXT_PROVIDER "${configured}". Supported values: "mock".`);
    this.name = "UnsupportedTextProviderError";
  }
}

export class TextProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextProviderConfigurationError";
  }
}

/**
 * Server-side provider selection, driven by `AI_TEXT_PROVIDER` (default:
 * "mock") — mirrors `getVectorProvider()`/`getMockupProvider()`. Phase 9
 * deliberately implements only the mock case: no real LLM vendor is
 * integrated yet, so there is no credential-requiring branch to
 * misconfigure. When a real provider is added later it follows the same
 * pattern as `getImageProvider()`'s "openai" case — read its required env
 * var here, throw `TextProviderConfigurationError` if missing, and never
 * fall back to mock silently. An unsupported value fails loudly instead of
 * silently choosing any provider, paid or otherwise.
 */
export function getTextProvider(): TextProvider {
  const configured = (process.env.AI_TEXT_PROVIDER || "mock").trim().toLowerCase();

  switch (configured) {
    case "mock":
      return new MockTextProvider();
    default:
      throw new UnsupportedTextProviderError(configured);
  }
}
