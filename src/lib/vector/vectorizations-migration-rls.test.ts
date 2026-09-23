import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 7 migration's raw SQL TEXT — not a live
 * database test. It cannot prove Postgres actually enforces the policy
 * (only a real RLS run against a live database can — see
 * supabase/tests/20260926_vectorizations_rls.sql for that, which is
 * deliberately NOT run here or by `npm run test`, since it requires this
 * migration to already be applied to a real project, which has not
 * happened).
 *
 * What this test IS good for: it's a fast, always-on regression guard.
 * If someone later "simplifies" the INSERT/UPDATE policies back to the
 * vulnerable `with check (auth.uid() = user_id)` form — which was the
 * actual, confirmed cross-user vectorizations_design_id_unique
 * denial-of-service found during Phase 7 migration review (User A could
 * squat User B's design_id, permanently blocking User B's own legitimate
 * vectorize attempt, invisibly and unremovably from User B's side) — this
 * test fails immediately in CI, before the change ever reaches a live
 * database. See the SQL comment directly above the policies in the
 * migration file for the full vulnerability writeup.
 */
const migrationPath = join(__dirname, "../../../supabase/migrations/20260926000000_create_vectorizations.sql");
const sql = readFileSync(migrationPath, "utf8");

function policyBlock(policyName: string): string {
  const start = sql.indexOf(`create policy "${policyName}"`);
  if (start === -1) throw new Error(`Policy not found in migration: ${policyName}`);
  const end = sql.indexOf(";", start);
  return sql.slice(start, end + 1);
}

describe("20260926000000_create_vectorizations.sql — RLS ownership-consistency guard", () => {
  it("the INSERT policy requires the referenced design to belong to the same user_id AND project_id", () => {
    const block = policyBlock("Users can create their own vectorizations");
    expect(block).toMatch(/for\s+insert/i);
    expect(block).toMatch(/exists\s*\(/i);
    expect(block).toMatch(/from\s+public\.designs\s+d/i);
    expect(block).toMatch(/d\.id\s*=\s*design_id/i);
    expect(block).toMatch(/d\.user_id\s*=\s*user_id/i);
    expect(block).toMatch(/d\.project_id\s*=\s*project_id/i);
  });

  it("the UPDATE policy's WITH CHECK also requires the same ownership-consistency EXISTS clause", () => {
    const block = policyBlock("Users can update their own vectorizations");
    expect(block).toMatch(/for\s+update/i);
    // The USING clause alone (auth.uid() = user_id) is fine for read access to
    // the OLD row, but WITH CHECK must independently re-validate the NEW row —
    // a bare `with check (auth.uid() = user_id)` here is exactly the gap that
    // let a row be mutated into (or out of) a cross-user reference.
    const withCheckIndex = block.search(/with\s+check/i);
    expect(withCheckIndex).toBeGreaterThan(-1);
    const withCheckClause = block.slice(withCheckIndex);
    expect(withCheckClause).toMatch(/exists\s*\(/i);
    expect(withCheckClause).toMatch(/from\s+public\.designs\s+d/i);
    expect(withCheckClause).toMatch(/d\.user_id\s*=\s*user_id/i);
    expect(withCheckClause).toMatch(/d\.project_id\s*=\s*project_id/i);
  });

  it("does NOT contain the vulnerable bare-ownership INSERT policy as a standalone statement", () => {
    // Guards specifically against the exact regression: an INSERT policy
    // whose entire check is `with check (auth.uid() = user_id)` with
    // nothing else — i.e. the EXISTS clause got removed/simplified away.
    const block = policyBlock("Users can create their own vectorizations");
    const bareForm = /with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)\s*;/i;
    expect(bareForm.test(block)).toBe(false);
  });

  it("SELECT and DELETE remain simple owner-scoped policies (no EXISTS needed — they cannot create a cross-user reference)", () => {
    const selectBlock = policyBlock("Users can view their own vectorizations");
    const deleteBlock = policyBlock("Users can delete their own vectorizations");
    expect(selectBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    expect(deleteBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
  });

  it("RLS is enabled on the table", () => {
    expect(sql).toMatch(/alter table public\.vectorizations enable row level security/i);
  });

  it("design_id remains UNIQUE (the constraint that makes the ownership check load-bearing, not cosmetic)", () => {
    expect(sql).toMatch(/constraint vectorizations_design_id_unique unique \(design_id\)/i);
  });
});
