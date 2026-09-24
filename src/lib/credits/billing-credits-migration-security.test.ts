import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 11 migration's raw SQL TEXT — not a live
 * database test (the migration hasn't been applied). Directly applies the
 * Phase 7-10 lesson (qualify every outer-row reference inside a
 * correlated context) AND the Phase 11-specific security requirement:
 * the two credit-mutation functions must have their PUBLIC execute
 * privilege revoked and only the correct role granted — this is the
 * primary defense against "User A calls the atomic credit RPC against
 * B" and "an authenticated user increases their own balance directly".
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
});

describe("credit_ledger_apply_own — the authenticated-user-safe wrapper", () => {
  const fn = functionBody("credit_ledger_apply_own");
  const body = fn.body;

  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path = public, pg_temp/i);
  });

  it("derives identity EXCLUSIVELY from auth.uid() — takes no user_id parameter at all", () => {
    expect(body).toMatch(/v_user_id\s*:=\s*auth\.uid\(\)/i);
    // The function signature (between the name and RETURNS) must not declare a p_user_id parameter.
    const signatureEnd = body.indexOf(")\nreturns");
    const signature = body.slice(0, signatureEnd);
    expect(signature).not.toMatch(/p_user_id/i);
  });

  it("rejects entry types other than generation_charge/refund — grants can never be reached through this path", () => {
    expect(body).toMatch(/p_entry_type not in \('generation_charge', 'refund'\)/i);
  });

  it("rejects an unauthenticated caller", () => {
    expect(body).toMatch(/not_authenticated/i);
  });

  it("PUBLIC execute is revoked and ONLY authenticated is granted", () => {
    const grantBlock = sql.slice(fn.end, fn.end + 500);
    expect(grantBlock).toMatch(/revoke all on function public\.credit_ledger_apply_own\([^)]*\) from public/i);
    expect(grantBlock).toMatch(/grant execute on function public\.credit_ledger_apply_own\([^)]*\) to authenticated/i);
  });
});

describe("schema-level invariants", () => {
  it("credit_ledger.amount can never be zero", () => {
    expect(sql).toMatch(/amount bigint not null check \(amount <> 0\)/i);
  });

  it("credit_ledger.idempotency_key is UNIQUE", () => {
    expect(sql).toMatch(/constraint credit_ledger_idempotency_key_unique unique \(idempotency_key\)/i);
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
