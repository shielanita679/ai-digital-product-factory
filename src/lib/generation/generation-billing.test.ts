import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Exercises the credit reserve/charge/refund semantics with a controlled
 * fake billable provider + fake generation job outcome — never a real
 * OpenAI call, matching the Phase 11 spec's explicit "never call OpenAI
 * merely to test billing" (section 19).
 *
 * SECURITY (post-review fix): startGenerationJobWithCredits now issues
 * every credit mutation via a SERVICE-ROLE client (createServiceRoleClient(),
 * mocked below to return a fake with the arbitrary-user_id
 * credit_ledger_apply semantics) rather than the caller's own RLS-scoped
 * ctx.supabase — an earlier version called credit_ledger_apply_own() on
 * ctx.supabase itself, which review found let an authenticated caller
 * mint arbitrary credits by invoking that RPC directly. ctx.supabase in
 * these tests is now used ONLY for the .from() reads (project/job
 * lookups) generation-billing.ts still performs on the caller's own
 * RLS-scoped client; asserting the credit mutations happen on the
 * SEPARATE service-role fake (and never on ctx.supabase) is itself part
 * of what these tests prove.
 */

const getImageProvider = vi.fn();
vi.mock("@/lib/ai/provider-registry", () => ({ getImageProvider }));

const startGenerationJob = vi.fn();
vi.mock("@/lib/generation/generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/generation/generation-service")>("@/lib/generation/generation-service");
  return { ...actual, startGenerationJob };
});

type Row = Record<string, unknown>;

/** Shared mutable state the mocked service-role client's rpc() reads/writes, reset per test via makeServiceRoleFake(). */
let ledger: Row[] = [];
let balance = 0;

function serviceRoleRpc(fn: string, args: Record<string, unknown>) {
  expect(fn).toBe("credit_ledger_apply");
  const amount = args.p_amount as number;
  const idempotencyKey = args.p_idempotency_key as string;
  const existing = ledger.find((r) => r.idempotency_key === idempotencyKey);
  if (existing) {
    return Promise.resolve({ data: [{ ledger_id: existing.id, balance, was_duplicate: true }], error: null });
  }
  const newBalance = balance + amount;
  if (newBalance < 0) {
    return Promise.resolve({ data: null, error: { message: "insufficient_credits", code: "P0001", details: String(balance) } });
  }
  balance = newBalance;
  const id = `ledger_${ledger.length + 1}`;
  ledger.push({ id, user_id: args.p_user_id, amount, entry_type: args.p_entry_type, idempotency_key: idempotencyKey });
  return Promise.resolve({ data: [{ ledger_id: id, balance, was_duplicate: false }], error: null });
}

const createServiceRoleClient = vi.fn(() => ({ rpc: serviceRoleRpc }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient }));

const { startGenerationJobWithCredits } = await import("@/lib/generation/generation-billing");
const { GenerationServiceError } = await import("@/lib/generation/generation-service");
const { CREDIT_COSTS } = await import("@/config/credits");

function makeReadOnlyCtxSupabase(input: { requestedCount: number; completedCount?: number }) {
  const rpc = vi.fn(async () => {
    throw new Error("ctx.supabase.rpc must never be called for credit mutations — that was the removed vulnerability's call site");
  });
  return {
    rpc,
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
    _rpcSpy: rpc,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

beforeEach(() => {
  getImageProvider.mockReset();
  startGenerationJob.mockReset();
  createServiceRoleClient.mockClear();
  ledger = [];
  balance = 0;
});

describe("startGenerationJobWithCredits — mock provider bypass", () => {
  it("delegates straight to startGenerationJob with ZERO credit calls when the provider is mock", async () => {
    getImageProvider.mockReturnValue({ name: "mock" });
    startGenerationJob.mockResolvedValue({ jobId: "job-1" });
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 4 });

    const result = await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");

    expect(result.jobId).toBe("job-1");
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(startGenerationJob).toHaveBeenCalledWith({ supabase, userId: "u1" }, "project-1");
  });
});

describe("startGenerationJobWithCredits — real provider, multi-design reserve/refund", () => {
  it("all 4 succeed: reserves 4, no refund, net cost = 4 (the exact spec example, all-success case)", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-1" });
    balance = 10;
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 4, completedCount: 4 });

    const result = await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");

    expect(result.jobId).toBe("job-1");
    expect(balance).toBe(10 - 4 * CREDIT_COSTS.imageGeneration);
    expect(ledger).toHaveLength(1); // just the reserve — no refund entry when nothing was unused
    expect(supabase._rpcSpy).not.toHaveBeenCalled(); // credit mutations went through the service-role client, never ctx.supabase
  });

  it("reserve 4, 3 succeed / 1 fails: final charge is exactly 3 (the spec's own worked example)", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-2" });
    balance = 10;
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 4, completedCount: 3 });

    await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");

    // Reserved 4 (balance 10 -> 6), then refunded 1 for the failed design (6 -> 7) = net charge 3.
    expect(balance).toBe(7);
    expect(ledger).toHaveLength(2);
    expect(ledger[0].entry_type).toBe("generation_charge");
    expect(ledger[0].amount).toBe(-4);
    expect(ledger[1].entry_type).toBe("refund");
    expect(ledger[1].amount).toBe(1);
  });

  it("all fail: reserve 4, refund all 4, net cost = 0", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-3" });
    balance = 10;
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 4, completedCount: 0 });

    await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");

    expect(balance).toBe(10); // fully refunded
  });

  it("insufficient credits: generation NEVER starts (startGenerationJob is never called)", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    balance = 2;
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 4 });

    await expect(startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1")).rejects.toMatchObject({
      code: "insufficient_credits",
    });
    expect(startGenerationJob).not.toHaveBeenCalled();
    expect(balance).toBe(2); // untouched
  });

  it("insufficient-credit error message reports exactly what's needed vs. available", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    balance = 2;
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 4 });

    await expect(startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1")).rejects.toMatchObject({
      message: "You need 4 credits but have 2.",
    });
  });

  it("startGenerationJob failing (e.g. job_already_active) refunds the FULL reservation immediately", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockRejectedValue(new GenerationServiceError("already running", "job_already_active"));
    balance = 10;
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 4 });

    await expect(startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1")).rejects.toThrow(GenerationServiceError);

    expect(balance).toBe(10); // reserved 4 then fully refunded
    expect(ledger.map((e: Row) => e.entry_type)).toEqual(["generation_charge", "refund"]);
  });

  it("rebuilding/retrying the SAME completed job id never double-refunds (idempotent finalize)", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-stable" });
    balance = 10;
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 4, completedCount: 3 });

    // Simulate the finalize step running twice for the exact same job id
    // (e.g. a hypothetical retry of this wrapper) by calling the
    // underlying idempotent refund path directly a second time with the
    // same key the wrapper would have used, on the SAME service-role
    // client the wrapper itself uses.
    await startGenerationJobWithCredits({ supabase, userId: "u1" }, "project-1");
    const balanceAfterFirst = balance;
    await serviceRoleRpc("credit_ledger_apply", {
      p_user_id: "u1",
      p_amount: 1,
      p_entry_type: "refund",
      p_reason: "dup",
      p_idempotency_key: "generation_refund:job-stable",
    });
    expect(balance).toBe(balanceAfterFirst); // unchanged — duplicate key is a no-op
  });

  it("every credit mutation is issued with the server-derived ctx.userId, never a value the browser could influence", async () => {
    getImageProvider.mockReturnValue({ name: "openai" });
    startGenerationJob.mockResolvedValue({ jobId: "job-4" });
    balance = 10;
    const supabase = makeReadOnlyCtxSupabase({ requestedCount: 2, completedCount: 2 });

    await startGenerationJobWithCredits({ supabase, userId: "trusted-server-derived-user-id" }, "project-1");

    expect(ledger.every((e) => e.user_id === "trusted-server-derived-user-id")).toBe(true);
  });
});
