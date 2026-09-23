import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getMockupProvider, UnsupportedMockupProviderError } from "@/lib/mockups/mockup-provider-registry";
import { MockMockupProvider } from "@/lib/mockups/providers/mock-mockup-provider";

const ORIGINAL_ENV = { ...process.env };

describe("getMockupProvider", () => {
  beforeEach(() => {
    delete process.env.MOCKUP_PROVIDER;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to the mock provider when MOCKUP_PROVIDER is unset", () => {
    expect(getMockupProvider()).toBeInstanceOf(MockMockupProvider);
  });

  it("returns the mock provider when MOCKUP_PROVIDER=mock", () => {
    process.env.MOCKUP_PROVIDER = "mock";
    expect(getMockupProvider()).toBeInstanceOf(MockMockupProvider);
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.MOCKUP_PROVIDER = "  MOCK  ";
    expect(getMockupProvider()).toBeInstanceOf(MockMockupProvider);
  });

  it("throws UnsupportedMockupProviderError for an unknown value, never silently choosing a paid provider", () => {
    process.env.MOCKUP_PROVIDER = "some-paid-vendor";
    expect(() => getMockupProvider()).toThrow(UnsupportedMockupProviderError);
  });
});
