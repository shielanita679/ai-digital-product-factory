import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 7 migration files' raw SQL TEXT — not a live
 * database test. It cannot prove Postgres actually enforces the policy
 * (only a real RLS run against a live database can — see
 * supabase/tests/20260926_vectorizations_rls.sql for that).
 *
 * What this test IS good for: it's a fast, always-on regression guard
 * against TWO separate confirmed issues, both found via live testing:
 *
 * 1. The original cross-user vulnerability: INSERT/UPDATE policies with
 *    no ownership-consistency check at all (`with check (auth.uid() =
 *    user_id)` alone), which let User A squat User B's design_id via
 *    the vectorizations_design_id_unique constraint.
 *
 * 2. The identifier-shadowing bug found in the FIRST fix: even with an
 *    EXISTS(...) ownership check added, leaving its references to the
 *    row-being-written as bare `user_id`/`project_id` (instead of
 *    `vectorizations.user_id`/`vectorizations.project_id`) let Postgres
 *    silently resolve them against public.designs' OWN same-named
 *    columns inside the correlated subquery — turning
 *    `d.project_id = project_id` into the tautology
 *    `d.project_id = d.project_id`, always true regardless of what was
 *    actually submitted. This was empirically confirmed live: a user
 *    could attach their own legitimately-owned design to ANOTHER user's
 *    project_id. See 20260927000000_fix_vectorizations_relational_rls.sql
 *    for the fix and full writeup.
 *
 * Every assertion below requires the FULLY QUALIFIED form
 * (`vectorizations.user_id` / `vectorizations.design_id` /
 * `vectorizations.project_id`) and explicitly fails on both the original
 * bare-ownership form AND the bare-but-EXISTS-wrapped ambiguous form
 * (`d.project_id = project_id` with no `vectorizations.` qualifier).
 */
const originalMigrationPath = join(__dirname, "../../../supabase/migrations/20260926000000_create_vectorizations.sql");
const correctiveMigrationPath = join(__dirname, "../../../supabase/migrations/20260927000000_fix_vectorizations_relational_rls.sql");
const originalSql = readFileSync(originalMigrationPath, "utf8");
const correctiveSql = readFileSync(correctiveMigrationPath, "utf8");

/** Strips `--` line comments so structural "does NOT contain statement X" checks aren't tripped up by prose that happens to mention X (e.g. this file's own doc comments discussing what it deliberately doesn't do). */
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}
const correctiveSqlCode = stripSqlComments(correctiveSql);

function policyBlock(sql: string, policyName: string, occurrence = 0): string {
  let start = -1;
  let fromIndex = 0;
  for (let i = 0; i <= occurrence; i++) {
    start = sql.indexOf(`create policy "${policyName}"`, fromIndex);
    if (start === -1) throw new Error(`Policy not found (occurrence ${i}): ${policyName}`);
    fromIndex = start + 1;
  }
  const end = sql.indexOf(";", start);
  return sql.slice(start, end + 1);
}

/**
 * Asserts a policy block's EXISTS(...) ownership check uses the fully
 * qualified `vectorizations.<col>` form for all three outer-row
 * references, and explicitly rejects both the bare form (`= user_id`)
 * and any other unqualified variant.
 */
function expectFullyQualifiedOwnershipCheck(block: string) {
  expect(block).toMatch(/exists\s*\(/i);
  expect(block).toMatch(/from\s+public\.designs\s+d/i);
  expect(block).toMatch(/d\.id\s*=\s*vectorizations\.design_id/i);
  expect(block).toMatch(/d\.user_id\s*=\s*vectorizations\.user_id/i);
  expect(block).toMatch(/d\.project_id\s*=\s*vectorizations\.project_id/i);
  expect(block).toMatch(/auth\.uid\(\)\s*=\s*vectorizations\.user_id/i);

  // Extract just the EXISTS(...) subquery body so the negative checks
  // below can't be defeated by, e.g., a qualified reference appearing
  // elsewhere in the same policy block.
  const existsStart = block.search(/exists\s*\(/i);
  const subquery = block.slice(existsStart);

  // The exact regression this guards against: `d.project_id = project_id`
  // (or d.user_id = user_id / d.id = design_id) with NO `vectorizations.`
  // qualifier between `=` and the column name — this is the
  // tautology-via-shadowing bug, not a stylistic difference. Because
  // `\s*` only allows whitespace, these patterns cannot match the
  // qualified form (where `vectorizations.` sits between `=` and the
  // column name), so this only fires on a genuine regression back to
  // the bare/ambiguous form.
  expect(subquery).not.toMatch(/\bd\.project_id\s*=\s*project_id\b/i);
  expect(subquery).not.toMatch(/\bd\.user_id\s*=\s*user_id\b/i);
  expect(subquery).not.toMatch(/\bd\.id\s*=\s*design_id\b/i);
}

describe("20260926000000_create_vectorizations.sql — RLS ownership-consistency guard (fresh-database form)", () => {
  it("the INSERT policy's EXISTS check fully qualifies every outer-row reference", () => {
    const block = policyBlock(originalSql, "Users can create their own vectorizations");
    expect(block).toMatch(/for\s+insert/i);
    expectFullyQualifiedOwnershipCheck(block);
  });

  it("the UPDATE policy's WITH CHECK also fully qualifies every outer-row reference", () => {
    const block = policyBlock(originalSql, "Users can update their own vectorizations");
    expect(block).toMatch(/for\s+update/i);
    const withCheckIndex = block.search(/with\s+check/i);
    expect(withCheckIndex).toBeGreaterThan(-1);
    expectFullyQualifiedOwnershipCheck(block.slice(withCheckIndex));
  });

  it("does NOT contain the vulnerable bare-ownership INSERT policy as a standalone statement", () => {
    const block = policyBlock(originalSql, "Users can create their own vectorizations");
    const bareForm = /with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)\s*;/i;
    expect(bareForm.test(block)).toBe(false);
  });

  it("SELECT and DELETE remain simple owner-scoped policies (no EXISTS needed — they cannot create a cross-user reference)", () => {
    const selectBlock = policyBlock(originalSql, "Users can view their own vectorizations");
    const deleteBlock = policyBlock(originalSql, "Users can delete their own vectorizations");
    expect(selectBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    expect(deleteBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
  });

  it("RLS is enabled on the table", () => {
    expect(originalSql).toMatch(/alter table public\.vectorizations enable row level security/i);
  });

  it("design_id remains UNIQUE (the constraint that makes the ownership check load-bearing, not cosmetic)", () => {
    expect(originalSql).toMatch(/constraint vectorizations_design_id_unique unique \(design_id\)/i);
  });
});

describe("20260927000000_fix_vectorizations_relational_rls.sql — corrective migration for the already-applied live database", () => {
  it("drops both flawed policies before recreating them (safe to run once against a database that already has 20260926's version)", () => {
    expect(correctiveSql).toMatch(/drop policy if exists "Users can create their own vectorizations" on public\.vectorizations/i);
    expect(correctiveSql).toMatch(/drop policy if exists "Users can update their own vectorizations" on public\.vectorizations/i);
  });

  it("does not touch SELECT, DELETE, the table definition, or Storage", () => {
    expect(correctiveSqlCode).not.toMatch(/create policy "Users can view their own vectorizations"/i);
    expect(correctiveSqlCode).not.toMatch(/create policy "Users can delete their own vectorizations"/i);
    expect(correctiveSqlCode).not.toMatch(/create table/i);
    expect(correctiveSqlCode).not.toMatch(/alter table public\.vectorizations\s+(add|drop|alter)\s+column/i);
    expect(correctiveSqlCode).not.toMatch(/storage\.objects/i);
  });

  it("the recreated INSERT policy's EXISTS check fully qualifies every outer-row reference", () => {
    const block = policyBlock(correctiveSql, "Users can create their own vectorizations");
    expect(block).toMatch(/for\s+insert/i);
    expectFullyQualifiedOwnershipCheck(block);
  });

  it("the recreated UPDATE policy's WITH CHECK also fully qualifies every outer-row reference", () => {
    const block = policyBlock(correctiveSql, "Users can update their own vectorizations");
    expect(block).toMatch(/for\s+update/i);
    const withCheckIndex = block.search(/with\s+check/i);
    expect(withCheckIndex).toBeGreaterThan(-1);
    expectFullyQualifiedOwnershipCheck(block.slice(withCheckIndex));
  });
});
