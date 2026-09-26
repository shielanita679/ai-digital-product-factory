import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ZERO real Supabase network calls in this file. Models check_rate_limit()
 * as an in-memory fixed-window counter with the SAME atomic-per-call shape
 * as the real Postgres function (one synchronous increment-and-read per
 * call, no internal awaited gap between reading and writing the counter)
 * — this is what actually makes the real SQL function race-free (a single
 * `INSERT ... ON CONFLICT ... RETURNING` statement), so the fake
 * reproduces that shape rather than re-implementing separate application-
 * level locking.
 */

type Bucket = { count: number; windowStart: number };
let store: Map<string, Bucket>;

type RpcResult = { data: { allowed: boolean; current_count: number; reset_at: string }[] | null; error: { message: string } | null };

function fakeCheckRateLimit(args: { p_user_id: string; p_operation: string; p_window_seconds: number; p_max_requests: number }): Promise<RpcResult> {
  const windowStart = Math.floor(Date.now() / 1000 / args.p_window_seconds) * args.p_window_seconds;
  const key = `${args.p_user_id}:${args.p_operation}:${windowStart}`;
  const existing = store.get(key);
  const count = (existing?.windowStart === windowStart ? existing.count : 0) + 1;
  store.set(key, { count, windowStart });
  const resetAt = new Date((windowStart + args.p_window_seconds) * 1000).toISOString();
  return Promise.resolve({ data: [{ allowed: count <= args.p_max_requests, current_count: count, reset_at: resetAt }], error: null });
}

const rpc = vi.fn((fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
  expect(fn).toBe("check_rate_limit");
  return fakeCheckRateLimit(args as never);
});
const createServiceRoleClient = vi.fn(() => ({ rpc }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient }));

const captureException = vi.fn();
vi.mock("@/lib/errors/error-reporter", () => ({ ErrorReporter: { captureException, captureMessage: vi.fn() } }));

const { enforceRateLimit, RateLimitError } = await import("@/lib/rate-limit/rate-limiter");

beforeEach(() => {
  store = new Map();
  rpc.mockClear();
  captureException.mockClear();
});

describe("enforceRateLimit — threshold enforcement", () => {
  it("requests below the threshold pass (image_generation: 20/hour)", async () => {
    for (let i = 0; i < 20; i++) {
      await expect(enforceRateLimit("u1", "image_generation")).resolves.toBeUndefined();
    }
  });

  it("the request that pushes count over the threshold is rejected with RateLimitError", async () => {
    for (let i = 0; i < 20; i++) {
      await enforceRateLimit("u1", "image_generation");
    }
    await expect(enforceRateLimit("u1", "image_generation")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("a lower-limit operation (stripe_checkout: 10/hour) rejects at its own threshold, independent of other operations", async () => {
    for (let i = 0; i < 10; i++) {
      await enforceRateLimit("u1", "stripe_checkout");
    }
    await expect(enforceRateLimit("u1", "stripe_checkout")).rejects.toBeInstanceOf(RateLimitError);
    // A different operation for the same user is unaffected.
    await expect(enforceRateLimit("u1", "vectorization")).resolves.toBeUndefined();
  });
});

describe("enforceRateLimit — per-user isolation", () => {
  it("two different users are tracked completely independently", async () => {
    for (let i = 0; i < 10; i++) {
      await enforceRateLimit("u1", "stripe_checkout");
    }
    await expect(enforceRateLimit("u1", "stripe_checkout")).rejects.toBeInstanceOf(RateLimitError);
    // u2 has made zero requests — must not be affected by u1 exhausting their own limit.
    await expect(enforceRateLimit("u2", "stripe_checkout")).resolves.toBeUndefined();
  });
});

describe("enforceRateLimit — window reset behavior", () => {
  it("a new window resets the count (simulated via a very short window)", async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 10; i++) {
        await enforceRateLimit("u1", "stripe_checkout");
      }
      await expect(enforceRateLimit("u1", "stripe_checkout")).rejects.toBeInstanceOf(RateLimitError);

      // Advance past the 1-hour window.
      vi.advanceTimersByTime(60 * 60 * 1000 + 1000);

      await expect(enforceRateLimit("u1", "stripe_checkout")).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("enforceRateLimit — no read-then-write race from application code", () => {
  it("makes exactly ONE rpc call per enforceRateLimit invocation (the atomicity is Postgres's single statement, not app-level locking)", async () => {
    await enforceRateLimit("u1", "image_generation");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("10 concurrent calls against a limit of 20 all resolve, each seeing a distinct incremented count (no lost updates)", async () => {
    await Promise.all(Array.from({ length: 10 }, () => enforceRateLimit("u1", "image_generation")));
    const key = [...store.keys()][0];
    expect(store.get(key)?.count).toBe(10);
  });
});

describe("enforceRateLimit — fails open on infrastructure errors, never blocks the caller", () => {
  it("an RPC-returned error fails open (resolves, does not throw) and is reported", async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "function does not exist" } }));
    await expect(enforceRateLimit("u1", "image_generation")).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalled();
  });

  it("a thrown exception (e.g. service-role client not configured) fails open, never propagates", async () => {
    createServiceRoleClient.mockImplementationOnce(() => {
      throw new Error("not configured");
    });
    await expect(enforceRateLimit("u1", "image_generation")).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalled();
  });
});

describe("webhooks are never rate-limited", () => {
  it("stripe_checkout/stripe_portal are the only Stripe-related operations in the catalog — no webhook operation exists", async () => {
    const { RATE_LIMIT_OPERATION_VALUES } = await import("@/config/rate-limits");
    expect(RATE_LIMIT_OPERATION_VALUES).not.toContain("stripe_webhook");
    expect(RATE_LIMIT_OPERATION_VALUES).toEqual(
      expect.arrayContaining(["image_generation", "vectorization", "mockup_generation", "listing_generation", "package_generation", "stripe_checkout", "stripe_portal"]),
    );
  });
});
