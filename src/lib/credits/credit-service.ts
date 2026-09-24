import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, CreditAccount, CreditLedgerEntry, Json } from "@/types/supabase";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { FREE_SIGNUP_CREDITS, type CreditEntryType } from "@/config/credits";

export type CreditContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type CreditServiceErrorCode = "not_authenticated" | "insufficient_credits" | "invalid_config" | "db_error" | "migration_not_applied";

export class CreditServiceError extends Error {
  readonly code: CreditServiceErrorCode;
  /** Populated only for insufficient_credits — the balance BEFORE the rejected debit, read back from the DB error detail. */
  readonly availableBalance?: number;
  constructor(message: string, code: CreditServiceErrorCode, availableBalance?: number) {
    super(message);
    this.name = "CreditServiceError";
    this.code = code;
    this.availableBalance = availableBalance;
  }
}

export type LedgerApplyResult = { ledgerId: string; balance: number; wasDuplicate: boolean };

function mapRpcError(error: { code?: string; message?: string; details?: string } | null): CreditServiceError {
  if (isMigrationNotAppliedError(error)) {
    return new CreditServiceError(friendlyDbErrorMessage(error, "Credits aren't set up yet."), "migration_not_applied");
  }
  if (error?.message?.includes("insufficient_credits")) {
    const available = error.details ? Number.parseInt(error.details, 10) : undefined;
    return new CreditServiceError("Insufficient credits.", "insufficient_credits", Number.isFinite(available) ? available : undefined);
  }
  if (error?.message?.includes("not_authenticated")) {
    return new CreditServiceError("You must be signed in.", "not_authenticated");
  }
  if (error?.message?.includes("idempotency_key_conflict")) {
    return new CreditServiceError("A credit operation with this idempotency key already exists for a different mutation.", "db_error");
  }
  return new CreditServiceError(friendlyDbErrorMessage(error, "Could not update your credit balance."), "db_error");
}

/**
 * SECURITY (Phase 11 post-review fix): the ONLY function in this codebase
 * that calls the service-role-only credit_ledger_apply() RPC — every
 * credit mutation (signup grants, subscription grants, generation
 * charges, generation refunds, manual adjustments) goes through this one
 * function. `supabase` MUST be a service-role client (see
 * src/lib/supabase/service-role.ts); user_id, amount, entry_type, and
 * idempotency_key are all REQUIRED, explicit parameters the caller must
 * derive itself from trusted server-side context (an authenticated
 * session's user id, a server-computed cost/plan amount, a
 * server-generated key) — never from browser-supplied input.
 *
 * There is deliberately NO "apply to the calling user's own account"
 * variant exposed to the `authenticated` Postgres role: an earlier draft
 * of the Phase 11 migration defined credit_ledger_apply_own(), granted to
 * `authenticated`, which derived identity safely from auth.uid() but
 * still let the caller choose the amount and entry_type (restricted only
 * to generation_charge/refund) — an authenticated user could call it
 * directly with entry_type='refund', amount=1000000 and mint arbitrary
 * credits into their own account. That function has been removed from
 * the migration entirely (never applied to a live database), and every
 * former caller now goes through this service-role path instead, with
 * the credit cost derived server-side (see
 * src/lib/generation/generation-billing.ts).
 */
export async function applyCreditMutation(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    amount: number;
    entryType: CreditEntryType;
    reason: string;
    idempotencyKey: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<LedgerApplyResult> {
  const { data, error } = await supabase.rpc("credit_ledger_apply", {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_entry_type: input.entryType,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
    p_metadata: (input.metadata ?? {}) as Json,
  });
  if (error || !data || data.length === 0) throw mapRpcError(error);
  const row = data[0];
  return { ledgerId: row.ledger_id, balance: row.balance, wasDuplicate: row.was_duplicate };
}

/**
 * Grants or adjusts an ARBITRARY user's balance — a thin, semantically
 * narrowed alias of applyCreditMutation restricted to the grant/adjust
 * entry types, for callers (WebhookService, ensureSignupCreditsGranted)
 * that should never be able to pass a generation_charge/refund by
 * mistake. `supabase` MUST be a service-role client.
 */
export async function grantCredits(
  supabase: SupabaseClient<Database>,
  input: {
    userId: string;
    amount: number;
    entryType: Extract<CreditEntryType, "signup_grant" | "subscription_grant" | "adjustment">;
    reason: string;
    idempotencyKey: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<LedgerApplyResult> {
  return applyCreditMutation(supabase, input);
}

/**
 * Idempotent per user (idempotency_key = "signup_grant:{userId}") — safe
 * to call on every dashboard page load (see src/app/dashboard/layout.tsx),
 * including for users who existed before Phase 11 shipped. This IS a
 * deliberate, explained retroactive grant, not a silent migration
 * backfill: every user, new or pre-existing, receives FREE_SIGNUP_CREDITS
 * exactly once, the first time they visit any billing-aware page after
 * Phase 11 ships — never triggered by a database migration, never
 * repeated. See the Phase 11 final report's "signup/free-credit behavior"
 * section for the full reasoning.
 */
export async function ensureSignupCreditsGranted(supabase: SupabaseClient<Database>, userId: string): Promise<void> {
  if (FREE_SIGNUP_CREDITS <= 0) return;
  await grantCredits(supabase, {
    userId,
    amount: FREE_SIGNUP_CREDITS,
    entryType: "signup_grant",
    reason: `${FREE_SIGNUP_CREDITS} free signup credits`,
    idempotencyKey: `signup_grant:${userId}`,
  });
}

export async function getCreditAccount(ctx: CreditContext): Promise<CreditAccount | null> {
  const { data, error } = await ctx.supabase.from("credit_accounts").select("*").eq("user_id", ctx.userId).maybeSingle();
  if (error) {
    if (isMigrationNotAppliedError(error)) return null;
    throw new CreditServiceError(friendlyDbErrorMessage(error, "Could not load your credit balance."), "db_error");
  }
  return data;
}

/** 0 for a user with no credit_accounts row yet (never granted/charged anything) — never throws for that case, only for a genuine query failure. */
export async function getBalance(ctx: CreditContext): Promise<number> {
  const account = await getCreditAccount(ctx);
  return account?.balance ?? 0;
}

export async function listLedgerEntries(ctx: CreditContext, limit = 25): Promise<CreditLedgerEntry[]> {
  const { data, error } = await ctx.supabase.from("credit_ledger").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (isMigrationNotAppliedError(error)) return [];
    throw new CreditServiceError(friendlyDbErrorMessage(error, "Could not load your credit history."), "db_error");
  }
  return data ?? [];
}
