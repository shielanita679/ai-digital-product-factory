import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getTextProvider, UnsupportedTextProviderError } from "@/lib/ai/text-provider-registry";
import { MockTextProvider } from "@/lib/ai/providers/mock-text-provider";

const ORIGINAL_ENV = { ...process.env };

describe("getTextProvider", () => {
  beforeEach(() => {
    delete process.env.AI_TEXT_PROVIDER;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to the mock provider when AI_TEXT_PROVIDER is unset", () => {
    expect(getTextProvider()).toBeInstanceOf(MockTextProvider);
  });

  it("returns the mock provider when AI_TEXT_PROVIDER=mock", () => {
    process.env.AI_TEXT_PROVIDER = "mock";
    expect(getTextProvider()).toBeInstanceOf(MockTextProvider);
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.AI_TEXT_PROVIDER = "  MOCK  ";
    expect(getTextProvider()).toBeInstanceOf(MockTextProvider);
  });

  it("throws UnsupportedTextProviderError for an unknown value, never silently choosing a paid provider", () => {
    process.env.AI_TEXT_PROVIDER = "some-paid-llm";
    expect(() => getTextProvider()).toThrow(UnsupportedTextProviderError);
  });
});
