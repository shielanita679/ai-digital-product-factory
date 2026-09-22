import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { getVectorProvider, UnsupportedVectorProviderError } from "@/lib/vector/vector-provider-registry";
import { MockVectorProvider } from "@/lib/vector/providers/mock-vector-provider";

const ORIGINAL_ENV = { ...process.env };

describe("getVectorProvider", () => {
  beforeEach(() => {
    delete process.env.VECTOR_PROVIDER;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to the mock provider when VECTOR_PROVIDER is unset", () => {
    expect(getVectorProvider()).toBeInstanceOf(MockVectorProvider);
  });

  it("returns the mock provider when VECTOR_PROVIDER=mock", () => {
    process.env.VECTOR_PROVIDER = "mock";
    expect(getVectorProvider()).toBeInstanceOf(MockVectorProvider);
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.VECTOR_PROVIDER = "  MOCK  ";
    expect(getVectorProvider()).toBeInstanceOf(MockVectorProvider);
  });

  it("throws UnsupportedVectorProviderError for an unknown value, never silently choosing a paid provider", () => {
    process.env.VECTOR_PROVIDER = "some-paid-vendor";
    expect(() => getVectorProvider()).toThrow(UnsupportedVectorProviderError);
  });
});
