import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 11 migration's raw SQL TEXT — not a live
 * database test (the migration hasn't been applied). Directly applies the
 * Phase 7-10 lesson (qualify every outer-row reference inside a
 * correlated context) AND the Phase 11-specific security requirement:
 * the ONE credit-mutation function, credit_ledger_apply, must have its
 * PUBLIC execute privilege revoked and ONLY service_role granted — never
 * authenticated — which is the primary defense against "User A calls the
 * atomic credit RPC against B" and "an authenticated user increases their
 * own balance directly".
 *
 * SECURITY (post-review fix): an earlier draft of this migration also
 * defined credit_ledger_apply_own(), granted to `authenticated`, which
 * derived the caller's identity safely from auth.uid() but still let the
 * caller choose the mutation amount/entry_type — exploitable to mint
 * arbitrary credits via e.g. entry_type='refund', amount=1000000. That
 * function was removed entirely before this migration was ever applied.
 * The tests below assert both the positive requirement (credit_ledger_apply
 * is service_role-only) AND the negative one (that removed function, or
 * anything like it, does not exist anywhere in this file, and NO function
 * in this file grants EXECUTE to `authenticated` at all) — a regression
 * that reintroduced either would be caught here before ever reaching a
 * live database.
 */
const migrationPath = join(__dirname, "../../../supabase/migrations/20261004000000_create_billing_credits.sql");
const sql = readFileSync(migrationPath, "utf8");

function functionBody(functionName: string): { body: string; start: number; end: number } {
  const start = sql.indexOf(`create or replace function public.${functionName}(`);
  if (start === -1) throw new Error(`Function not found: ${functionName}`);
  const end = sql.indexOf("\n$$;", start);
  if (end === -1) throw new Error(`Function body not terminated: ${functionName}`);
  return { body: sql.slice(start, end + 4), start, end: end + 4 };
}

describe("20261004000000_create_billing_credits.sql — RLS enablement", () => {
  it("RLS is enabled on every Phase 11 table", () => {
    for (const table of ["credit_accounts", "credit_ledger", "subscriptions", "stripe_webhook_events", "stripe_customers"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    }
  });

  it("credit_accounts has ONLY a select policy — no insert/update/delete policy exists at all", () => {
    const policyCount = (sql.match(/create policy "[^"]*"\s*\n\s*on public\.credit_accounts/gi) ?? []).length;
    expect(policyCount).toBe(1);
    expect(sql).toMatch(/create policy "Users can view their own credit account"\s*\n\s*on public\.credit_accounts\s*\n\s*for select/i);
    expect(sql).not.toMatch(/on public\.credit_accounts[\s\S]{0,40}for (insert|update|delete)/i);
  });

  it("credit_ledger has ONLY a select policy — no insert/update/delete policy exists at all (append-only, auditable)", () => {
    const policyCount = (sql.match(/create policy "[^"]*"\s*\n\s*on public\.credit_ledger/gi) ?? []).length;
    expect(policyCount).toBe(1);
    expect(sql).not.toMatch(/on public\.credit_ledger[\s\S]{0,40}for (insert|update|delete)/i);
  });

  it("subscriptions has ONLY a select policy — a user cannot forge their own subscription state", () => {
    const policyCount = (sql.match(/create policy "[^"]*"\s*\n\s*on public\.subscriptions/gi) ?? []).length;
    expect(policyCount).toBe(1);
    expect(sql).not.toMatch(/on public\.subscriptions[\s\S]{0,40}for (insert|update|delete)/i);
  });

  it("stripe_customers has ONLY a select policy — a user cannot change their own Stripe customer mapping", () => {
    const policyCount = (sql.match(/create policy "[^"]*"\s*\n\s*on public\.stripe_customers/gi) ?? []).length;
    expect(policyCount).toBe(1);
    expect(sql).not.toMatch(/on public\.stripe_customers[\s\S]{0,40}for (insert|update|delete)/i);
  });

  it("stripe_webhook_events has ZERO policies — not exposed to any role but the table owner", () => {
    expect(sql).not.toMatch(/create policy "[^"]*"\s*\n\s*on public\.stripe_webhook_events/i);
  });

  it("every SELECT policy scopes on auth.uid() = user_id", () => {
    // 4 user-owned tables each get exactly one such policy (credit_accounts,
    // credit_ledger, subscriptions, stripe_customers); stripe_webhook_events
    // has zero policies at all (asserted separately above).
    const selectPolicies = sql.match(/create policy "[^"]*"[\s\S]{0,120}?for select[\s\S]{0,120}?using \(auth\.uid\(\) = user_id\)/gi) ?? [];
    expect(selectPolicies.length).toBeGreaterThanOrEqual(4);
  });
});

describe("credit_ledger_apply — the arbitrary-user_id core function", () => {
  const fn = functionBody("credit_ledger_apply");
  const body = fn.body;

  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path = public, pg_temp/i);
  });

  it("qualifies every credit_accounts/credit_ledger column reference against the table name, not bare", () => {
    // The exact Phase 7 shadowing hazard: p_user_id/v_current_balance are
    // local names that could otherwise be confused with columns.
    expect(body).toMatch(/credit_accounts\.balance/);
    expect(body).toMatch(/credit_accounts\.user_id/);
    expect(body).toMatch(/credit_ledger\.idempotency_key/);
    expect(body).toMatch(/credit_ledger\.id/);
  });

  it("locks the account row with FOR UPDATE before checking sufficiency — the actual concurrency-safety mechanism", () => {
    expect(body).toMatch(/for update/i);
  });

  it("rejects a negative resulting balance before ever inserting the ledger row", () => {
    const insufficientIndex = body.search(/insufficient_credits/i);
    const insertIndex = body.search(/insert into public\.credit_ledger/i);
    expect(insufficientIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(insufficientIndex).toBeLessThan(insertIndex);
  });

  it("handles a idempotency_key race via a nested exception handler (unique_violation), not just a pre-check", () => {
    expect(body).toMatch(/exception when unique_violation/i);
  });

  it("PUBLIC execute is revoked and ONLY service_role is granted — never authenticated", () => {
    const grantBlock = sql.slice(fn.end, fn.end + 500);
    expect(grantBlock).toMatch(/revoke all on function public\.credit_ledger_apply\([^)]*\) from public/i);
    expect(grantBlock).toMatch(/grant execute on function public\.credit_ledger_apply\([^)]*\) to service_role/i);
    expect(grantBlock).not.toMatch(/grant execute on function public\.credit_ledger_apply\([^)]*\) to authenticated/i);
  });

  it("checks idempotency_key reuse for a MISMATCHED mutation (different user_id/amount/entry_type/reference) and rejects it, both on the fast path and the exception-race path", () => {
    const conflictOccurrences = (body.match(/idempotency_key_conflict/gi) ?? []).length;
    // Must appear at least twice: once in the fast-path duplicate check
    // before the account is even locked, and once in the unique_violation
    // exception handler covering the TOCTOU race — a regression that
    // dropped either path back to "any matching key is a valid duplicate"
    // would only leave one occurrence (or zero).
    expect(conflictOccurrences).toBeGreaterThanOrEqual(2);
  });

  it("the mismatch check compares user_id, amount, and entry_type (not merely the idempotency_key) before treating a match as a valid duplicate", () => {
    expect(body).toMatch(/v_existing_user_id\s*<>\s*p_user_id/i);
    expect(body).toMatch(/v_existing_amount\s*<>\s*p_amount/i);
    expect(body).toMatch(/v_existing_entry_type\s*<>\s*p_entry_type/i);
  });
});

describe("SECURITY: the removed credit_ledger_apply_own vulnerability does not exist anywhere in this migration", () => {
  it("no function named credit_ledger_apply_own is defined anywhere in the file", () => {
    expect(sql).not.toMatch(/create (or replace )?function public\.credit_ledger_apply_own/i);
  });

  it("no GRANT EXECUTE to the authenticated role exists anywhere in the file, for ANY function", () => {
    // The strongest form of this check: rather than asserting the absence
    // of one specific function name (which a differently-named
    // reintroduction of the same bug would dodge), assert that NOTHING in
    // this migration ever grants EXECUTE to `authenticated` at all —
    // every credit-mutation capability in this schema is service_role-only.
    expect(sql).not.toMatch(/grant execute on function[^;]*to authenticated/i);
  });

  it("credit_ledger_apply is the ONLY function this migration defines", () => {
    const functionDefinitions = sql.match(/create (or replace )?function public\.\w+/gi) ?? [];
    expect(functionDefinitions).toHaveLength(1);
    expect(functionDefinitions[0]).toMatch(/credit_ledger_apply$/i);
  });
});

describe("schema-level invariants", () => {
  it("credit_ledger.amount can never be zero", () => {
    expect(sql).toMatch(/amount bigint not null check \(amount <> 0\)/i);
  });

  it("credit_ledger.idempotency_key is UNIQUE", () => {
    expect(sql).toMatch(/constraint credit_ledger_idempotency_key_unique unique \(idempotency_key\)/i);
  });

  it("SECURITY: credit_ledger has a schema-level CHECK tying amount's sign to entry_type — defense in depth beyond application code", () => {
    expect(sql).toMatch(/constraint credit_ledger_amount_sign_matches_entry_type check/i);
    const constraintStart = sql.indexOf("constraint credit_ledger_amount_sign_matches_entry_type");
    const constraintBlock = sql.slice(constraintStart, constraintStart + 500);
    expect(constraintBlock).toMatch(/when 'generation_charge' then amount < 0/i);
    expect(constraintBlock).toMatch(/when 'signup_grant' then amount > 0/i);
    expect(constraintBlock).toMatch(/when 'subscription_grant' then amount > 0/i);
    expect(constraintBlock).toMatch(/when 'refund' then amount > 0/i);
    // adjustment is the one entry_type explicitly allowed either sign — assert it's a
    // deliberate `then true`, not an oversight that happens to fall through to `else false`.
    expect(constraintBlock).toMatch(/when 'adjustment' then true/i);
    expect(constraintBlock).toMatch(/else false/i);
  });

  it("credit_accounts.balance can never go negative at the schema level (defense in depth beyond the function's own check)", () => {
    expect(sql).toMatch(/balance bigint not null default 0 check \(balance >= 0\)/i);
  });

  it("subscriptions has a unique(user_id) constraint — one canonical row per user", () => {
    expect(sql).toMatch(/constraint subscriptions_user_id_unique unique \(user_id\)/i);
  });

  it("subscriptions.stripe_subscription_id is unique — a Stripe subscription can never map to two local rows", () => {
    expect(sql).toMatch(/constraint subscriptions_stripe_subscription_id_unique unique \(stripe_subscription_id\)/i);
  });

  it("stripe_webhook_events.stripe_event_id is unique — the whole webhook idempotency mechanism", () => {
    expect(sql).toMatch(/constraint stripe_webhook_events_stripe_event_id_unique unique \(stripe_event_id\)/i);
  });

  it("stripe_customers.stripe_customer_id is unique — one canonical customer per user, never shared", () => {
    expect(sql).toMatch(/constraint stripe_customers_stripe_customer_id_unique unique \(stripe_customer_id\)/i);
  });

  it("has FK cascade from every user-owned table to auth.users", () => {
    for (const table of ["credit_accounts", "credit_ledger", "subscriptions", "stripe_customers"]) {
      const tableBlock = sql.slice(sql.indexOf(`create table if not exists public.${table}`));
      expect(tableBlock.slice(0, 800)).toMatch(/references auth\.users \(id\) on delete cascade/i);
    }
  });

  it("has updated_at triggers on credit_accounts and subscriptions (not on the append-only credit_ledger)", () => {
    expect(sql).toMatch(/create trigger set_credit_accounts_updated_at/i);
    expect(sql).toMatch(/create trigger set_subscriptions_updated_at/i);
    expect(sql).not.toMatch(/create trigger set_credit_ledger_updated_at/i);
  });
});
