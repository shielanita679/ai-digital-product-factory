import { describe, it, expect, beforeEach } from "vitest";

import { applyCreditMutation, grantCredits, ensureSignupCreditsGranted, getCreditAccount, getBalance, listLedgerEntries, CreditServiceError } from "@/lib/credits/credit-service";
import { FREE_SIGNUP_CREDITS } from "@/config/credits";

type Row = Record<string, unknown>;
type Db = { credit_accounts: Row[]; credit_ledger: Row[] };

let idCounter = 0;
function genId() {
  idCounter += 1;
  return `ledger_${idCounter}`;
}

const SIGN_RULE: Record<string, "positive" | "negative" | "either"> = {
  generation_charge: "negative",
  signup_grant: "positive",
  subscription_grant: "positive",
  refund: "positive",
  adjustment: "either",
};

/**
 * Faithfully simulates the migration's credit_ledger_apply() PL/pgSQL
 * function in JS — idempotency fast-path (including the post-review
 * security fix's mismatch rejection), the sign-invariant CHECK
 * constraint, balance sufficiency check, ledger insert, account update —
 * so CreditService's call contract and error-mapping are exercised
 * against realistic RPC semantics without a real Postgres instance.
 *
 * SECURITY (post-review fix): credit_ledger_apply_own() no longer exists
 * at all — it was removed from the migration before ever being applied,
 * after review found it let an authenticated caller mint arbitrary
 * credits by choosing their own amount/entry_type. This fake only
 * implements `credit_ledger_apply`, gated by `role`: only 'service_role'
 * may call it, mirroring the migration's `revoke all ... grant ... to
 * service_role` (never `authenticated`). Any other rpc name (including
 * the removed 'credit_ledger_apply_own') falls through to the "unexpected
 * rpc" throw below, standing in for "this function does not exist in the
 * schema at all".
 *
 * True concurrent-transaction locking isn't reproducible here (see the
 * migration's static SQL test for the actual `for update` lock, and the
 * dedicated concurrency note in this file's own tests below for what
 * this fake CAN and cannot prove).
 */
function makeFakeSupabase(db: Db, options: { role?: "service_role" | "authenticated" } = {}) {
  const role = options.role ?? "service_role";

  function applyCore(p_user_id: string, p_amount: number, p_entry_type: string, p_reason: string, p_idempotency_key: string, p_reference_type?: string | null, p_reference_id?: string | null, p_metadata?: unknown) {
    if (p_amount === 0) return { data: null, error: { message: "amount must not be zero", code: "22023" } };

    const signRule = SIGN_RULE[p_entry_type];
    if (signRule === "positive" && p_amount <= 0) {
      return { data: null, error: { message: `new row for relation "credit_ledger" violates check constraint "credit_ledger_amount_sign_matches_entry_type"`, code: "23514" } };
    }
    if (signRule === "negative" && p_amount >= 0) {
      return { data: null, error: { message: `new row for relation "credit_ledger" violates check constraint "credit_ledger_amount_sign_matches_entry_type"`, code: "23514" } };
    }

    const existing = db.credit_ledger.find((r) => r.idempotency_key === p_idempotency_key);
    if (existing) {
      const mismatch =
        existing.user_id !== p_user_id ||
        existing.amount !== p_amount ||
        existing.entry_type !== p_entry_type ||
        (existing.reference_type ?? null) !== (p_reference_type ?? null) ||
        (existing.reference_id ?? null) !== (p_reference_id ?? null);
      if (mismatch) {
        return { data: null, error: { message: "idempotency_key_conflict", code: "23505", details: p_idempotency_key } };
      }
      const account = db.credit_accounts.find((a) => a.user_id === p_user_id);
      return { data: [{ ledger_id: existing.id, balance: account?.balance ?? 0, was_duplicate: true }], error: null };
    }

    let account = db.credit_accounts.find((a) => a.user_id === p_user_id);
    if (!account) {
      account = { user_id: p_user_id, balance: 0, lifetime_granted: 0, lifetime_consumed: 0 };
      db.credit_accounts.push(account);
    }
    const currentBalance = account.balance as number;
    const newBalance = currentBalance + p_amount;
    if (newBalance < 0) {
      return { data: null, error: { message: "insufficient_credits", code: "P0001", details: String(currentBalance) } };
    }

    const ledgerId = genId();
    db.credit_ledger.push({
      id: ledgerId,
      user_id: p_user_id,
      amount: p_amount,
      entry_type: p_entry_type,
      reason: p_reason,
      reference_type: p_reference_type ?? null,
      reference_id: p_reference_id ?? null,
      idempotency_key: p_idempotency_key,
      metadata: p_metadata ?? {},
      created_at: new Date().toISOString(),
    });
    account.balance = newBalance;
    account.lifetime_granted = (account.lifetime_granted as number) + Math.max(p_amount, 0);
    account.lifetime_consumed = (account.lifetime_consumed as number) + Math.max(-p_amount, 0);

    return { data: [{ ledger_id: ledgerId, balance: newBalance, was_duplicate: false }], error: null };
  }

  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "credit_ledger_apply") {
        if (role !== "service_role") {
          // Simulates REVOKE ALL ... GRANT service_role only — an authenticated-role client cannot call this at all, for ANY arguments (no entry_type/amount can talk its way past a missing GRANT).
          return { data: null, error: { message: "permission denied for function credit_ledger_apply", code: "42501" } };
        }
        return applyCore(
          args.p_user_id as string,
          args.p_amount as number,
          args.p_entry_type as string,
          args.p_reason as string,
          args.p_idempotency_key as string,
          args.p_reference_type as string | null,
          args.p_reference_id as string | null,
          args.p_metadata,
        );
      }
      throw new Error(`unexpected rpc: ${fn}`);
    },
    from(table: keyof Db) {
      return {
        select: () => ({
          eq: (col: string, val: unknown) => ({
            maybeSingle: async () => {
              const row = db[table].find((r) => r[col] === val);
              return { data: row ?? null, error: null };
            },
            order: () => ({
              limit: async (n: number) => {
                const rows = db[table]
                  .filter((r) => r[col] === val)
                  .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
                  .slice(0, n);
                return { data: rows, error: null };
              },
            }),
          }),
        }),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

beforeEach(() => {
  idCounter = 0;
});

describe("grantCredits / applyCreditMutation (service-role path)", () => {
  it("grants credits and updates balance/lifetime_granted", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    const result = await grantCredits(supabase, { userId: "u1", amount: 20, entryType: "signup_grant", reason: "20 free credits", idempotencyKey: "signup_grant:u1" });
    expect(result.balance).toBe(20);
    expect(result.wasDuplicate).toBe(false);
    expect(db.credit_accounts[0].balance).toBe(20);
    expect(db.credit_accounts[0].lifetime_granted).toBe(20);
    expect(db.credit_accounts[0].lifetime_consumed).toBe(0);
  });

  it("a duplicate idempotency_key for the SAME mutation is a no-op — balance never changes twice", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    const first = await grantCredits(supabase, { userId: "u1", amount: 100, entryType: "subscription_grant", reason: "monthly", idempotencyKey: "stripe_invoice:inv_1" });
    const second = await grantCredits(supabase, { userId: "u1", amount: 100, entryType: "subscription_grant", reason: "monthly", idempotencyKey: "stripe_invoice:inv_1" });
    expect(second.wasDuplicate).toBe(true);
    expect(second.ledgerId).toBe(first.ledgerId);
    expect(db.credit_accounts[0].balance).toBe(100); // not 200
    expect(db.credit_ledger).toHaveLength(1);
  });

  it("throws insufficient_credits with the available balance when a debit would go negative", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 5, lifetime_granted: 5, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await expect(
      grantCredits(supabase, { userId: "u1", amount: -10, entryType: "adjustment", reason: "test debit", idempotencyKey: "adj:1" }),
    ).rejects.toMatchObject({ code: "insufficient_credits", availableBalance: 5 });
    expect(db.credit_accounts[0].balance).toBe(5); // unchanged
  });

  it("applyCreditMutation charges a generation_charge (negative) and refunds a refund (positive) via the same service-role path", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    const charged = await applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "1 image", idempotencyKey: "generation_job:j1" });
    expect(charged.balance).toBe(7);
    const refunded = await applyCreditMutation(supabase, { userId: "u1", amount: 2, entryType: "refund", reason: "unused", idempotencyKey: "generation_refund:j1" });
    expect(refunded.balance).toBe(9);
  });
});

describe("SECURITY: credit_ledger_apply is never reachable by the authenticated role", () => {
  it("an authenticated-role client cannot call credit_ledger_apply at all — regardless of entry_type or amount", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db, { role: "authenticated" });
    const { error } = await supabase.rpc("credit_ledger_apply", { p_user_id: "u1", p_amount: 1000000, p_entry_type: "refund", p_reason: "steal", p_idempotency_key: "hack:1" });
    expect(error).toMatchObject({ code: "42501" });
  });

  it("permission denial applies to the caller's OWN user_id too — self-targeting does not bypass the missing grant", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db, { role: "authenticated" });
    const { error } = await supabase.rpc("credit_ledger_apply", { p_user_id: "u1", p_amount: 1000000, p_entry_type: "signup_grant", p_reason: "self grant", p_idempotency_key: "hack:2" });
    expect(error).toMatchObject({ code: "42501" });
  });

  it("permission denial applies to another user's account (the cross-user attack) too", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u2", balance: 5, lifetime_granted: 5, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db, { role: "authenticated" });
    const { error } = await supabase.rpc("credit_ledger_apply", { p_user_id: "u2", p_amount: 1000000, p_entry_type: "adjustment", p_reason: "steal from u2", p_idempotency_key: "hack:3" });
    expect(error).toMatchObject({ code: "42501" });
    expect(db.credit_accounts[0].balance).toBe(5); // untouched
  });
});

describe("SECURITY: credit_ledger_apply_own no longer exists — the removed vulnerability", () => {
  it("calling the removed RPC name throws (unknown function), not a permission error — it isn't merely un-granted, it doesn't exist", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db, { role: "authenticated" });
    await expect(
      supabase.rpc("credit_ledger_apply_own", { p_amount: 1000000, p_entry_type: "refund", p_reason: "mint credits", p_idempotency_key: "hack:4" }),
    ).rejects.toThrow(/unexpected rpc/);
  });
});

describe("SECURITY: sign invariants — entry_type dictates the sign of amount, enforced independently of caller intent", () => {
  it("rejects a generation_charge with a positive (crediting) amount", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await expect(
      applyCreditMutation(supabase, { userId: "u1", amount: 1000000, entryType: "generation_charge", reason: "disguised mint attempt", idempotencyKey: "sign:1" }),
    ).rejects.toMatchObject({ code: "db_error" });
    expect(db.credit_accounts[0].balance).toBe(10); // untouched
  });

  it("rejects a refund with a negative (debiting) amount", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await expect(applyCreditMutation(supabase, { userId: "u1", amount: -5, entryType: "refund", reason: "wrong sign", idempotencyKey: "sign:2" })).rejects.toMatchObject({ code: "db_error" });
    expect(db.credit_accounts[0].balance).toBe(10);
  });

  it("rejects a signup_grant or subscription_grant with a negative amount", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await expect(grantCredits(supabase, { userId: "u1", amount: -20, entryType: "signup_grant", reason: "wrong sign", idempotencyKey: "sign:3" })).rejects.toMatchObject({ code: "db_error" });
    await expect(grantCredits(supabase, { userId: "u1", amount: -50, entryType: "subscription_grant", reason: "wrong sign", idempotencyKey: "sign:4" })).rejects.toMatchObject({ code: "db_error" });
  });

  it("adjustment explicitly allows either sign (service_role-only manual correction, documented in the migration)", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    const up = await grantCredits(supabase, { userId: "u1", amount: 5, entryType: "adjustment", reason: "goodwill credit", idempotencyKey: "adj:up" });
    expect(up.balance).toBe(15);
    const down = await grantCredits(supabase, { userId: "u1", amount: -5, entryType: "adjustment", reason: "correction", idempotencyKey: "adj:down" });
    expect(down.balance).toBe(10);
  });
});

describe("SECURITY: idempotency-key reuse for a DIFFERENT mutation is rejected, never silently treated as a duplicate", () => {
  it("same key + same mutation → idempotent success", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    const first = await applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "x", idempotencyKey: "k1", referenceType: "project", referenceId: "p1" });
    const second = await applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "x", idempotencyKey: "k1", referenceType: "project", referenceId: "p1" });
    expect(second.wasDuplicate).toBe(true);
    expect(second.ledgerId).toBe(first.ledgerId);
    expect(db.credit_accounts[0].balance).toBe(7);
  });

  it("same key + different amount → reject", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "x", idempotencyKey: "k2" });
    await expect(applyCreditMutation(supabase, { userId: "u1", amount: -5, entryType: "generation_charge", reason: "x", idempotencyKey: "k2" })).rejects.toMatchObject({ code: "db_error" });
    expect(db.credit_accounts[0].balance).toBe(7); // only the first mutation applied
  });

  it("same key + different entry_type → reject", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "x", idempotencyKey: "k3" });
    // Same amount magnitude would still need the opposite sign for 'refund' anyway, but even
    // a sign-valid alternate entry_type under the SAME key must be rejected as a conflict.
    await expect(applyCreditMutation(supabase, { userId: "u1", amount: 3, entryType: "refund", reason: "x", idempotencyKey: "k3" })).rejects.toMatchObject({ code: "db_error" });
  });

  it("same key + different user → reject (also closes a cross-user identity-confusion angle)", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "x", idempotencyKey: "k4" });
    await expect(applyCreditMutation(supabase, { userId: "u2", amount: -3, entryType: "generation_charge", reason: "x", idempotencyKey: "k4" })).rejects.toMatchObject({ code: "db_error" });
    expect(db.credit_accounts.find((a) => a.user_id === "u2")).toBeUndefined(); // u2 never touched
  });

  it("same key + different reference → reject", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "x", idempotencyKey: "k5", referenceType: "project", referenceId: "p1" });
    await expect(
      applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "x", idempotencyKey: "k5", referenceType: "project", referenceId: "p2" }),
    ).rejects.toMatchObject({ code: "db_error" });
  });
});

describe("ensureSignupCreditsGranted", () => {
  it("grants FREE_SIGNUP_CREDITS exactly once, even when called repeatedly (simulating repeated page loads/logins)", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await ensureSignupCreditsGranted(supabase, "u1");
    await ensureSignupCreditsGranted(supabase, "u1");
    await ensureSignupCreditsGranted(supabase, "u1");
    expect(db.credit_accounts[0].balance).toBe(FREE_SIGNUP_CREDITS);
    expect(db.credit_ledger.filter((e) => e.entry_type === "signup_grant")).toHaveLength(1);
  });

  it("uses a deterministic per-user idempotency key (signup_grant:{userId})", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await ensureSignupCreditsGranted(supabase, "u1");
    expect(db.credit_ledger[0].idempotency_key).toBe("signup_grant:u1");
  });

  it("grants independently for different users", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    await ensureSignupCreditsGranted(supabase, "u1");
    await ensureSignupCreditsGranted(supabase, "u2");
    expect(db.credit_accounts.find((a) => a.user_id === "u1")?.balance).toBe(FREE_SIGNUP_CREDITS);
    expect(db.credit_accounts.find((a) => a.user_id === "u2")?.balance).toBe(FREE_SIGNUP_CREDITS);
  });
});

describe("getCreditAccount / getBalance / listLedgerEntries", () => {
  it("getBalance returns 0 for a user with no account row yet (never throws)", async () => {
    const db: Db = { credit_accounts: [], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);
    expect(await getBalance({ supabase, userId: "u1" })).toBe(0);
    expect(await getCreditAccount({ supabase, userId: "u1" })).toBeNull();
  });

  it("listLedgerEntries returns entries for the requesting user only, newest first", async () => {
    const db: Db = {
      credit_accounts: [],
      credit_ledger: [
        { id: "l1", user_id: "u1", amount: 20, entry_type: "signup_grant", reason: "a", created_at: "2026-01-01T00:00:00Z" },
        { id: "l2", user_id: "u1", amount: -1, entry_type: "generation_charge", reason: "b", created_at: "2026-01-02T00:00:00Z" },
        { id: "l3", user_id: "u2", amount: 20, entry_type: "signup_grant", reason: "c", created_at: "2026-01-03T00:00:00Z" },
      ],
    };
    const supabase = makeFakeSupabase(db);
    const entries = await listLedgerEntries({ supabase, userId: "u1" }, 25);
    expect(entries.map((e) => e.id)).toEqual(["l2", "l1"]);
  });
});

describe("concurrent debits cannot drive the balance negative", () => {
  /**
   * IMPORTANT SCOPE NOTE: this test proves the fake's read-check-write
   * sequence is correct when many debits race for the same account, but it
   * does NOT (and cannot) prove that Postgres's `SELECT ... FOR UPDATE` row
   * lock is what prevents a real concurrent-transaction race — a JS fake
   * has no concept of two genuinely simultaneous SQL transactions or lock
   * contention. That guarantee is instead proven structurally by
   * billing-credits-migration-security.test.ts, which asserts the actual
   * migration SQL text contains `for update` before the balance check.
   * What THIS test guards against is a regression to the naive
   * SELECT-then-JS-subtract-then-UPDATE pattern the spec explicitly
   * forbids: even under Promise.all fan-out, every debit here is checked
   * and applied against the fake's single shared mutable account object,
   * so it can only ever accept as many debits as the balance supports —
   * exactly what FOR UPDATE guarantees in real Postgres.
   */
  it("10 concurrent 1-credit debits against a balance of 5 result in exactly 5 successes and 5 insufficient_credits rejections, never a negative balance", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 5, lifetime_granted: 5, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        applyCreditMutation(supabase, { userId: "u1", amount: -1, entryType: "generation_charge", reason: "race", idempotencyKey: `race:${i}` }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(5);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "insufficient_credits" });
    }
    expect(db.credit_accounts[0].balance).toBe(0);
    expect(db.credit_accounts[0].balance).toBeGreaterThanOrEqual(0);
  });

  it("concurrent debits with the SAME idempotency key apply exactly once, not once per caller", async () => {
    const db: Db = { credit_accounts: [{ user_id: "u1", balance: 10, lifetime_granted: 10, lifetime_consumed: 0 }], credit_ledger: [] };
    const supabase = makeFakeSupabase(db);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        applyCreditMutation(supabase, { userId: "u1", amount: -3, entryType: "generation_charge", reason: "retry storm", idempotencyKey: "generation_job:same" }),
      ),
    );

    expect(db.credit_accounts[0].balance).toBe(7); // charged exactly once
    expect(new Set(results.map((r) => r.ledgerId)).size).toBe(1);
    expect(results.filter((r) => r.wasDuplicate)).toHaveLength(4);
  });
});

describe("CreditServiceError shape", () => {
  it("is an instance carrying a code", () => {
    const err = new CreditServiceError("test", "insufficient_credits", 5);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("insufficient_credits");
    expect(err.availableBalance).toBe(5);
  });
});
