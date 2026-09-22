import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getImageProvider, UnsupportedProviderError, ProviderConfigurationError } from "@/lib/ai/provider-registry";
import { MockImageProvider } from "@/lib/ai/providers/mock-image-provider";
import { OpenAIImageProvider } from "@/lib/ai/providers/openai-image-provider";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("getImageProvider", () => {
  beforeEach(() => {
    delete process.env.AI_IMAGE_PROVIDER;
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(resetEnv);

  it("selects MockImageProvider by default (no AI_IMAGE_PROVIDER set)", () => {
    const provider = getImageProvider();
    expect(provider).toBeInstanceOf(MockImageProvider);
  });

  it('selects MockImageProvider when AI_IMAGE_PROVIDER="mock"', () => {
    process.env.AI_IMAGE_PROVIDER = "mock";
    const provider = getImageProvider();
    expect(provider).toBeInstanceOf(MockImageProvider);
  });

  it('selects OpenAIImageProvider when AI_IMAGE_PROVIDER="openai" and OPENAI_API_KEY is set', () => {
    process.env.AI_IMAGE_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
    const provider = getImageProvider();
    expect(provider).toBeInstanceOf(OpenAIImageProvider);
    expect(provider.name).toBe("openai");
  });

  it('fails safely (does NOT fall back to mock) when AI_IMAGE_PROVIDER="openai" but OPENAI_API_KEY is missing', () => {
    process.env.AI_IMAGE_PROVIDER = "openai";
    expect(() => getImageProvider()).toThrow(ProviderConfigurationError);
    try {
      getImageProvider();
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConfigurationError);
      // Never leaks a key value (there isn't one), and clearly names the
      // missing env var so the failure is actionable, not a stack trace.
      expect((err as Error).message).toContain("OPENAI_API_KEY");
      expect((err as Error).message).not.toMatch(/sk-/);
    }
  });

  it("fails safely with a clear error for an unsupported provider value", () => {
    process.env.AI_IMAGE_PROVIDER = "some-made-up-vendor";
    expect(() => getImageProvider()).toThrow(UnsupportedProviderError);
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.AI_IMAGE_PROVIDER = "  MOCK  ";
    expect(getImageProvider()).toBeInstanceOf(MockImageProvider);
  });
});
