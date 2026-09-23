import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 9 migration's raw SQL TEXT — not a live
 * database test (see supabase/tests/20260930_product_listings_rls.sql for
 * that, deliberately not run here since the migration hasn't been
 * applied). Directly applies the Phase 7/8 lesson: product_listings,
 * product_bundles, and projects all have a `user_id` column, and
 * product_listings/product_bundles both have a `project_id` column. Any
 * correlated EXISTS(...) subquery in these policies that leaves a
 * reference to the row-being-written unqualified is a live shadowing
 * hazard — Postgres resolves an unqualified identifier against the
 * subquery's OWN FROM-list first, silently turning an ownership check
 * into a tautology. See src/lib/vector/vectorizations-migration-rls.test.ts
 * and src/lib/bundles/bundles-migration-rls.test.ts for the earlier
 * versions of this guard, and 20260930000000_create_product_listings.sql's
 * own top-of-file comment for the full writeup this migration was written
 * against from the start.
 */
const migrationPath = join(__dirname, "../../../supabase/migrations/20260930000000_create_product_listings.sql");
const sql = readFileSync(migrationPath, "utf8");

function policyBlock(policyName: string): string {
  const start = sql.indexOf(`create policy "${policyName}"`);
  if (start === -1) throw new Error(`Policy not found: ${policyName}`);
  const end = sql.indexOf(";", start);
  return sql.slice(start, end + 1);
}

/** Every reference to the row's own columns inside an EXISTS(...) must be qualified as `<table>.<col>` — never bare. */
function expectFullyQualified(block: string, table: string, columns: string[]) {
  expect(block).toMatch(/exists\s*\(/i);
  for (const col of columns) {
    const qualified = new RegExp(`\\b${table}\\.${col}\\b`, "i");
    expect(block).toMatch(qualified);
  }

  const existsStart = block.search(/exists\s*\(/i);
  // Strip JOIN ... ON ... clauses before scanning: those correlate two
  // INNER tables of the subquery to each other (e.g. `join projects p on
  // p.id = b.project_id`), never the outer row, so a `= <col>` there is
  // not a candidate for the outer-row-qualification check below.
  const subquery = block.slice(existsStart).replace(/join\s+\S+\s+\w+\s+on\s+[^\n]*/gi, "");
  for (const col of columns) {
    // Every occurrence of `= <col>` (optionally qualified) inside the
    // subquery must actually be qualified as `<table>.<col>` — a bare
    // `= <col>` is exactly the regression shape that silently shadows
    // against the correlated table's own same-named column.
    const matches = subquery.match(new RegExp(`=\\s*(\\w+\\.)?${col}\\b`, "gi")) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m.toLowerCase()).toMatch(new RegExp(`${table}\\.${col}$`, "i"));
    }
  }
}

describe("20260930000000_create_product_listings.sql — RLS ownership-consistency guard", () => {
  it("RLS is enabled on product_listings", () => {
    expect(sql).toMatch(/alter table public\.product_listings enable row level security/i);
  });

  it("INSERT policy fully qualifies user_id/project_id/bundle_id references and joins BOTH product_bundles and projects", () => {
    const block = policyBlock("Users can create their own listings");
    expect(block).toMatch(/for\s+insert/i);
    expect(block).toMatch(/from\s+public\.product_bundles\s+b/i);
    expect(block).toMatch(/join\s+public\.projects\s+p/i);
    expectFullyQualified(block, "product_listings", ["user_id", "project_id", "bundle_id"]);
  });

  it("UPDATE policy's WITH CHECK fully qualifies every outer-row reference", () => {
    const block = policyBlock("Users can update their own listings");
    const withCheckIndex = block.search(/with\s+check/i);
    expect(withCheckIndex).toBeGreaterThan(-1);
    expectFullyQualified(block.slice(withCheckIndex), "product_listings", ["user_id", "project_id", "bundle_id"]);
  });

  it("cross-checks the bundle's own project_id against the listing's claimed project_id (blocks a same-user wrong-project attachment)", () => {
    const block = policyBlock("Users can create their own listings");
    expect(block).toMatch(/b\.project_id\s*=\s*product_listings\.project_id/i);
  });

  it("cross-checks that the project itself is owned by the same user (the full user -> project -> bundle chain, not just a one-hop check)", () => {
    const block = policyBlock("Users can create their own listings");
    expect(block).toMatch(/p\.user_id\s*=\s*product_listings\.user_id/i);
  });

  it("SELECT and DELETE remain simple owner-scoped policies", () => {
    const selectBlock = policyBlock("Users can view their own listings");
    const deleteBlock = policyBlock("Users can delete their own listings");
    expect(selectBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    expect(deleteBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
  });

  it("has a unique(bundle_id, marketplace) constraint — one canonical row per bundle per marketplace", () => {
    expect(sql).toMatch(/constraint product_listings_bundle_marketplace_unique unique \(bundle_id, marketplace\)/i);
  });

  it("has FK cascade to product_bundles, projects, and auth.users", () => {
    expect(sql).toMatch(/bundle_id uuid not null references public\.product_bundles \(id\) on delete cascade/i);
    expect(sql).toMatch(/project_id uuid not null references public\.projects \(id\) on delete cascade/i);
    expect(sql).toMatch(/user_id uuid not null references auth\.users \(id\) on delete cascade/i);
  });

  it("has an updated_at trigger", () => {
    expect(sql).toMatch(/create trigger set_product_listings_updated_at/i);
    expect(sql).toMatch(/execute function public\.set_updated_at\(\)/i);
  });

  it("regression: rejects a bare, unqualified reference form if it were reintroduced", () => {
    // A deliberately vulnerable rewrite of the INSERT check, matching the
    // exact Phase 7 bug shape, must NOT match this migration's actual text.
    const vulnerableForm = /where\s+b\.id\s*=\s*bundle_id\s+and\s+b\.user_id\s*=\s*user_id/i;
    expect(sql).not.toMatch(vulnerableForm);
  });
});
