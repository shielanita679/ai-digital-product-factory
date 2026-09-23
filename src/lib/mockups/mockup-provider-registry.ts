import type { MockupProvider } from "@/lib/mockups/mockup-provider";
import { MockMockupProvider } from "@/lib/mockups/providers/mock-mockup-provider";

export class UnsupportedMockupProviderError extends Error {
  constructor(configured: string) {
    super(`Unsupported MOCKUP_PROVIDER "${configured}". Supported values: "mock".`);
    this.name = "UnsupportedMockupProviderError";
  }
}

export class MockupProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockupProviderConfigurationError";
  }
}

/**
 * Server-side provider selection, driven by `MOCKUP_PROVIDER` (default:
 * "mock") — mirrors getImageProvider()/getVectorProvider(). Phase 8
 * deliberately implements only the mock case: no real mockup vendor is
 * integrated yet, so there is no credential-requiring branch to
 * misconfigure. When a real provider is added later it follows the same
 * pattern as getImageProvider()'s "openai" case — read its required env
 * var here, throw MockupProviderConfigurationError if missing, and never
 * fall back to mock silently. An unsupported value fails loudly instead
 * of silently choosing any provider, paid or otherwise.
 */
export function getMockupProvider(): MockupProvider {
  const configured = (process.env.MOCKUP_PROVIDER || "mock").trim().toLowerCase();

  switch (configured) {
    case "mock":
      return new MockMockupProvider();
    default:
      throw new UnsupportedMockupProviderError(configured);
  }
}
