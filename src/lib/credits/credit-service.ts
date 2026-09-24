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
  return new CreditServiceError(friendlyDbErrorMessage(error, "Could not update your credit balance."), "db_error");
}

/**
 * Debits or credits the CALLING user's OWN account — identity comes from
 * the RLS-scoped client's own session (auth.uid() inside
 * credit_ledger_apply_own, never a parameter), so this can never touch
 * another user's balance regardless of what ctx.userId happens to be.
 * Restricted at the database layer to entry_type 'generation_charge' /
 * 'refund' only — see the migration's credit_ledger_apply_own() comment.
 */
export async function applyOwnLedgerEntry(
  ctx: CreditContext,
  input: {
    amount: number;
    entryType: Extract<CreditEntryType, "generation_charge" | "refund">;
    reason: string;
    idempotencyKey: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<LedgerApplyResult> {
  const { data, error } = await ctx.supabase.rpc("credit_ledger_apply_own", {
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
 * Grants or adjusts an ARBITRARY user's balance — service-role only (the
 * underlying credit_ledger_apply() function has no EXECUTE grant for
 * `authenticated`, so this throws a permission error if ever called with
 * an RLS-scoped client). Used exclusively by WebhookService (subscription
 * grants) and ensureSignupCreditsGranted below (signup grants) — never
 * exposed to a client-supplied user_id.
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
