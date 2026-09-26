import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Server-Action-layer coverage for generation.ts — previously untested
 * (Phase 13 test-coverage audit found zero coverage here). Mirrors
 * mockups.test.ts's mocking shape: every dependency mocked, zero real
 * Supabase/rate-limit network calls.
 */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const USER_ID = "55555555-5555-5555-5555-555555555555";
const requireUser = vi.fn(async () => ({ supabase: {}, user: { id: USER_ID } }));
vi.mock("@/lib/supabase/current-user", () => ({ requireUser }));

const startGenerationJobWithCredits = vi.fn();
const retryDesign = vi.fn();
const deleteDesign = vi.fn();
class GenerationServiceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}
vi.mock("@/lib/generation/generation-billing", () => ({ startGenerationJobWithCredits }));
vi.mock("@/lib/generation/generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generation/generation-service")>("@/lib/generation/generation-service");
  return { ...actual, retryDesign, deleteDesign, GenerationServiceError };
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

const { startGenerationAction, retryDesignAction, deleteDesignAction } = await import("@/app/actions/generation");

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const DESIGN_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  revalidatePath.mockClear();
  requireUser.mockClear();
  startGenerationJobWithCredits.mockReset();
  retryDesign.mockReset();
  deleteDesign.mockReset();
  enforceRateLimit.mockReset().mockResolvedValue(undefined);
});

describe("startGenerationAction", () => {
  it("rejects invalid input before ever calling requireUser/the service", async () => {
    const result = await startGenerationAction({ projectId: "not-a-uuid" });
    expect(result.ok).toBe(false);
    expect(requireUser).not.toHaveBeenCalled();
    expect(startGenerationJobWithCredits).not.toHaveBeenCalled();
  });

  it("enforces the rate limit before starting generation, using the server-derived user id", async () => {
    startGenerationJobWithCredits.mockResolvedValue({ jobId: "job-1" });
    const result = await startGenerationAction({ projectId: PROJECT_ID });
    expect(result).toEqual({ ok: true, data: { jobId: "job-1" } });
    expect(enforceRateLimit).toHaveBeenCalledWith(USER_ID, "image_generation");
    expect(startGenerationJobWithCredits).toHaveBeenCalledWith({ supabase: {}, userId: USER_ID }, PROJECT_ID);
  });

  it("a RateLimitError surfaces its friendly message and never reaches the service", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(42));
    const result = await startGenerationAction({ projectId: PROJECT_ID });
    expect(result).toEqual({ ok: false, error: "Too many requests — try again in 42s." });
    expect(startGenerationJobWithCredits).not.toHaveBeenCalled();
  });

  it("a GenerationServiceError surfaces its message", async () => {
    startGenerationJobWithCredits.mockRejectedValue(new GenerationServiceError("A generation job is already running.", "job_already_active"));
    const result = await startGenerationAction({ projectId: PROJECT_ID });
    expect(result).toEqual({ ok: false, error: "A generation job is already running." });
  });

  it("an unexpected throw returns a generic message, never leaking internals", async () => {
    startGenerationJobWithCredits.mockRejectedValue(new Error("connection reset"));
    const result = await startGenerationAction({ projectId: PROJECT_ID });
    expect(result).toEqual({ ok: false, error: "Could not start generation. Please try again." });
  });
});

describe("retryDesignAction", () => {
  it("enforces the rate limit using the server-derived user id, never a client-supplied one", async () => {
    const result = await retryDesignAction({ id: DESIGN_ID, userId: "attacker-controlled" });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(enforceRateLimit).toHaveBeenCalledWith(USER_ID, "image_generation");
    expect(retryDesign).toHaveBeenCalledWith({ supabase: {}, userId: USER_ID }, DESIGN_ID);
  });

  it("a RateLimitError surfaces its friendly message and never reaches the service", async () => {
    enforceRateLimit.mockRejectedValueOnce(new RateLimitError(7));
    const result = await retryDesignAction({ id: DESIGN_ID });
    expect(result).toEqual({ ok: false, error: "Too many requests — try again in 7s." });
    expect(retryDesign).not.toHaveBeenCalled();
  });
});

describe("deleteDesignAction — not rate-limited (not a generation call)", () => {
  it("deletes without ever calling enforceRateLimit", async () => {
    const result = await deleteDesignAction({ id: DESIGN_ID });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(deleteDesign).toHaveBeenCalledWith({ supabase: {}, userId: USER_ID }, DESIGN_ID);
  });
});
