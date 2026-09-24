import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Exercises the credit reserve/charge/refund semantics with a controlled
 * fake billable provider + fake generation job outcome — never a real
 * OpenAI call, matching the Phase 11 spec's explicit "never call OpenAI
 * merely to test billing" (section 19).
 */

const getImageProvider = vi.fn();
vi.mock("@/lib/ai/provider-registry", () => ({ getImageProvider }));

const startGenerationJob = vi.fn();
vi.mock("@/lib/generation/generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generation/generation-service")>("@/lib/generation/generation-service");
  return { ...actual, startGenerationJob };
});

const { startGenerationJobWithCredits } = await import("@/lib/generation/generation-billing");
const { GenerationServiceError } = await import("@/lib/generation/generation-service");
const { CREDIT_COSTS } = await import("@/config/credits");

type Row = Record<string, unknown>;

function makeFakeSupabase(input: { requestedCount: number; balance: number; completedCount?: number }) {
  let balance = input.balance;
  const ledger: Row[] = [];

  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe("credit_ledger_apply_own");
      const amount = args.p_amount as number;
      const idempotencyKey = args.p_idempotency_key as string;
      const existing = ledger.find((r) => r.idempotency_key === idempotencyKey);
      if (existing) {
        return { data: [{ ledger_id: existing.id, balance, was_duplicate: true }], error: null };
      }
      const newBalance = balance + amount;
      if (newBalance < 0) {
        return { data: null, error: { message: "insufficient_credits", code: "P0001", details: String(balance) } };
      }
      balance = newBalance;
      const id = `ledger_${ledger.length + 1}`;
      ledger.push({ id, amount, entry_type: args.p_entry_type, idempotency_key: idempotencyKey });
      return { data: [{ ledger_id: id, balance, was_duplicate: false }], error: null };
    },
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => {
                if (table === "projects") return { data: { requested_design_count: input.requestedCount }, error: null };
                return { data: null, error: { message: "not found" } };
              },
            }),
            single: async () => {
              if (table === "generation_jobs") return { data: { completed_count: input.completedCount ?? input.requestedCount }, error: null };
              return { data: null, error: { message: "not found" } };
            },
          }),
        }),
      };
    },
    _ledger: ledger,
    _getBalance: () => balance,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

beforeEach(() => {
  getImageProvider.mockReset();
  startGenerationJob.mockReset();
});

describe("startGenerationJobWithCredits — mock provider bypass", () => {
  it("delegates straight to startGenerationJob with ZERO credit calls when the provider is mock", async () => {
    getImageProvider.mockReturnValue({ name: "mock" });
    startGenerationJob.mockResolvedValue({ jobId: "job-1" });
    const supabase = makeFakeSupabase({ requestedCount: 4, balance: 0 });
    const rpcSpy = vi.spyOn(supabase, "rpc");

    const result = await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");

    expect(result.jobId).toBe("job-1");
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(startGenerationJob).toHaveBeenCalledWith({ supabase, userId: "u1" }, "project-1");
  });
});

describe("startGenerationJobWithCredits — real provider, multi-design reserve/refund", () => {
  it("all 4 succeed: reserves 4, no refund, net cost = 4 (the exact spec example, all-success case)", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-1" });
    const supabase = makeFakeSupabase({ requestedCount: 4, balance: 10, completedCount: 4 });

    const result = await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");

    expect(result.jobId).toBe("job-1");
    expect(supabase._getBalance()).toBe(10 - 4 * CREDIT_COSTS.imageGeneration);
    expect(supabase._ledger).toHaveLength(1); // just the reserve — no refund entry when nothing was unused
  });

  it("reserve 4, 3 succeed / 1 fails: final charge is exactly 3 (the spec's own worked example)", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-2" });
    const supabase = makeFakeSupabase({ requestedCount: 4, balance: 10, completedCount: 3 });

    await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");

    // Reserved 4 (balance 10 -> 6), then refunded 1 for the failed design (6 -> 7) = net charge 3.
    expect(supabase._getBalance()).toBe(7);
    expect(supabase._ledger).toHaveLength(2);
    expect(supabase._ledger[0].entry_type).toBe("generation_charge");
    expect(supabase._ledger[0].amount).toBe(-4);
    expect(supabase._ledger[1].entry_type).toBe("refund");
    expect(supabase._ledger[1].amount).toBe(1);
  });

  it("all fail: reserve 4, refund all 4, net cost = 0", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-3" });
    const supabase = makeFakeSupabase({ requestedCount: 4, balance: 10, completedCount: 0 });

    await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");

    expect(supabase._getBalance()).toBe(10); // fully refunded
  });

  it("insufficient credits: generation NEVER starts (startGenerationJob is never called)", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    const supabase = makeFakeSupabase({ requestedCount: 4, balance: 2 });

    await expect(startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1")).rejects.toMatchObject({
      code: "insufficient_credits",
    });
    expect(startGenerationJob).not.toHaveBeenCalled();
    expect(supabase._getBalance()).toBe(2); // untouched
  });

  it("insufficient-credit error message reports exactly what's needed vs. available", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    const supabase = makeFakeSupabase({ requestedCount: 4, balance: 2 });

    await expect(startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1")).rejects.toMatchObject({
      message: "You need 4 credits but have 2.",
    });
  });

  it("startGenerationJob failing (e.g. job_already_active) refunds the FULL reservation immediately", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockRejectedValue(new GenerationServiceError("already running", "job_already_active"));
    const supabase = makeFakeSupabase({ requestedCount: 4, balance: 10 });

    await expect(startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1")).rejects.toThrow(GenerationServiceError);

    expect(supabase._getBalance()).toBe(10); // reserved 4 then fully refunded
    expect(supabase._ledger.map((e: Row) => e.entry_type)).toEqual(["generation_charge", "refund"]);
  });

  it("rebuilding/retrying the SAME completed job id never double-refunds (idempotent finalize)", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-stable" });
    const supabase = makeFakeSupabase({ requestedCount: 4, balance: 10, completedCount: 3 });

    // Simulate the finalize step running twice for the exact same job id
    // (e.g. a hypothetical retry of this wrapper) by calling the
    // underlying idempotent refund path directly a second time with the
    // same key the wrapper would have used.
    await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");
    const balanceAfterFirst = supabase._getBalance();
    await supabase.rpc("credit_ledger_apply_own", {
      p_amount: 1,
      p_entry_type: "refund",
      p_reason: "dup",
      p_idempotency_key: "generation_refund:job-stable",
    });
    expect(supabase._getBalance()).toBe(balanceAfterFirst); // unchanged — duplicate key is a no-op
  });
});
