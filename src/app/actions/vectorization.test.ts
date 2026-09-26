import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Server-Action-layer coverage for vectorization.ts — previously untested
 * (Phase 13 test-coverage audit found zero coverage here). Mirrors
 * generation.test.ts's/mockups.test.ts's mocking shape: every dependency
 * mocked, zero real Supabase/rate-limit network calls.
 */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const USER_ID = "55555555-5555-5555-5555-555555555555";
const requireUser = vi.fn(async () => ({ supabase: {}, user: { id: USER_ID } }));
vi.mock("@/lib/supabase/current-user", () => ({ requireUser }));

const vectorizeDesign = vi.fn();
const deleteVectorization = vi.fn();
const getVectorizationDownloadUrl = vi.fn();
class VectorizationServiceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}
vi.mock("@/lib/vector/vectorize-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/vector/vectorize-service")>("@/lib/vector/vectorize-service");
  return { ...actual, vectorizeDesign, deleteVectorization, getVectorizationDownloadUrl, VectorizationServiceError };
});

const enforceRateLimit = vi.fn(async () => undefined);
class RateLimitError extends Error {
  code = "rate_limited" as const;
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Too many requests — try again in ${retryAfterSeconds}s.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
vi.mock("@/lib/rate-limit/rate-limiter", () => ({ enforceRateLimit, RateLimitError }));

const { vectorizeDesignAction, deleteVectorizationAction, getVectorizationDownloadUrlAction } = await import("@/app/actions/vectorization");

const DESIGN_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  revalidatePath.mockClear();
  requireUser.mockClear();
  vectorizeDesign.mockReset();
  deleteVectorization.mockReset();
  getVectorizationDownloadUrl.mockReset();
  enforceRateLimit.mockReset().mockResolvedValue(undefined);
});

describe("vectorizeDesignAction", () => {
  it("rejects invalid input before ever calling requireUser/the service", async () => {
    const result = await vectorizeDesignAction({ id: "not-a-uuid" });
    expect(result.ok).toBe(false);
    expect(requireUser).not.toHaveBeenCalled();
    expect(vectorizeDesign).not.toHaveBeenCalled();
  });

  it("enforces the rate limit before vectorizing, using the server-derived user id", async () => {
    vectorizeDesign.mockResolvedValue({ vectorizationId: "vec-1" });
    const result = await vectorizeDesignAction({ id: DESIGN_ID, userId: "attacker-controlled" });
    expect(result).toEqual({ ok: true, data: { vectorizationId: "vec-1" } });
    expect(enforceRateLimit).toHaveBeenCalledWith(USER_ID, "vectorization");
    expect(vectorizeDesign).toHaveBeenCalledWith({ supabase: {}, userId: USER_ID }, DESIGN_ID);
  });

  it("a RateLimitError surfaces its friendly message and never reaches the service", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(13));
    const result = await vectorizeDesignAction({ id: DESIGN_ID });
    expect(result).toEqual({ ok: false, error: "Too many requests — try again in 13s." });
    expect(vectorizeDesign).not.toHaveBeenCalled();
  });

  it("a VectorizationServiceError surfaces its message", async () => {
    vectorizeDesign.mockRejectedValue(new VectorizationServiceError("This design is already being vectorized.", "already_active"));
    const result = await vectorizeDesignAction({ id: DESIGN_ID });
    expect(result).toEqual({ ok: false, error: "This design is already being vectorized." });
  });

  it("an unexpected throw returns a generic message, never leaking internals", async () => {
    vectorizeDesign.mockRejectedValue(new Error("connection reset"));
    const result = await vectorizeDesignAction({ id: DESIGN_ID });
    expect(result).toEqual({ ok: false, error: "Could not vectorize this design. Please try again." });
  });
});

describe("deleteVectorizationAction / getVectorizationDownloadUrlAction — not rate-limited", () => {
  it("deletes without ever calling enforceRateLimit", async () => {
    const result = await deleteVectorizationAction({ id: DESIGN_ID });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(deleteVectorization).toHaveBeenCalledWith({ supabase: {}, userId: USER_ID }, DESIGN_ID);
  });

  it("prepares a download URL without ever calling enforceRateLimit", async () => {
    getVectorizationDownloadUrl.mockResolvedValue({ url: "https://signed.example/x.svg", filename: "x.svg" });
    const result = await getVectorizationDownloadUrlAction({ id: DESIGN_ID });
    expect(result).toEqual({ ok: true, data: { url: "https://signed.example/x.svg", filename: "x.svg" } });
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });
});
