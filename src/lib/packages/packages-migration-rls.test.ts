import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 10 migration's raw SQL TEXT — not a live
 * database test (the migration hasn't been applied). Directly applies the
 * Phase 7/8/9 lesson: product_packages, product_bundles, and projects all
 * have a `user_id` column, and product_packages/product_bundles both have
 * a `project_id` column. Any correlated EXISTS(...) subquery in these
 * policies that leaves a reference to the row-being-written unqualified is
 * a live shadowing hazard — Postgres resolves an unqualified identifier
 * against the subquery's OWN FROM-list first, silently turning an
 * ownership check into a tautology. See
 * src/lib/listings/listings-migration-rls.test.ts for the Phase 9 version
 * of this exact guard, which this file mirrors structurally.
 */
const migrationPath = join(__dirname, "../../../supabase/migrations/20261002000000_create_product_packages.sql");
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
  const subquery = block.slice(existsStart).replace(/join\s+\S+\s+\w+\s+on\s+[^\n]*/gi, "");
  for (const col of columns) {
    const matches = subquery.match(new RegExp(`=\\s*(\\w+\\.)?${col}\\b`, "gi")) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m.toLowerCase()).toMatch(new RegExp(`${table}\\.${col}$`, "i"));
    }
  }
}

describe("20261002000000_create_product_packages.sql — RLS ownership-consistency guard", () => {
  it("RLS is enabled on product_packages", () => {
    expect(sql).toMatch(/alter table public\.product_packages enable row level security/i);
  });

  it("INSERT policy fully qualifies user_id/project_id/bundle_id references and joins BOTH product_bundles and projects", () => {
    const block = policyBlock("Users can create their own packages");
    expect(block).toMatch(/for\s+insert/i);
    expect(block).toMatch(/from\s+public\.product_bundles\s+b/i);
    expect(block).toMatch(/join\s+public\.projects\s+p/i);
    expectFullyQualified(block, "product_packages", ["user_id", "project_id", "bundle_id"]);
  });

  it("UPDATE policy's WITH CHECK fully qualifies every outer-row reference", () => {
    const block = policyBlock("Users can update their own packages");
    const withCheckIndex = block.search(/with\s+check/i);
    expect(withCheckIndex).toBeGreaterThan(-1);
    expectFullyQualified(block.slice(withCheckIndex), "product_packages", ["user_id", "project_id", "bundle_id"]);
  });

  it("cross-checks the bundle's own project_id against the package's claimed project_id (blocks a same-user wrong-project attachment)", () => {
    const block = policyBlock("Users can create their own packages");
    expect(block).toMatch(/b\.project_id\s*=\s*product_packages\.project_id/i);
  });

  it("cross-checks that the project itself is owned by the same user (the full user -> project -> bundle chain, not just a one-hop check)", () => {
    const block = policyBlock("Users can create their own packages");
    expect(block).toMatch(/p\.user_id\s*=\s*product_packages\.user_id/i);
  });

  it("SELECT and DELETE remain simple owner-scoped policies", () => {
    const selectBlock = policyBlock("Users can view their own packages");
    const deleteBlock = policyBlock("Users can delete their own packages");
    expect(selectBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    expect(deleteBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
  });

  it("has a unique(bundle_id, marketplace) constraint — one canonical row per bundle per marketplace", () => {
    expect(sql).toMatch(/constraint product_packages_bundle_marketplace_unique unique \(bundle_id, marketplace\)/i);
  });

  it("has FK cascade to product_bundles, projects, and auth.users", () => {
    expect(sql).toMatch(/bundle_id uuid not null references public\.product_bundles \(id\) on delete cascade/i);
    expect(sql).toMatch(/project_id uuid not null references public\.projects \(id\) on delete cascade/i);
    expect(sql).toMatch(/user_id uuid not null references auth\.users \(id\) on delete cascade/i);
  });

  it("has an updated_at trigger", () => {
    expect(sql).toMatch(/create trigger set_product_packages_updated_at/i);
    expect(sql).toMatch(/execute function public\.set_updated_at\(\)/i);
  });

  it("checksum_sha256 is constrained to exactly 64 hex characters when set", () => {
    expect(sql).toMatch(/checksum_sha256 text check \(checksum_sha256 is null or char_length\(checksum_sha256\) = 64\)/i);
  });

  it("version and item_count/file_size_bytes have non-negative CHECK constraints", () => {
    expect(sql).toMatch(/version integer not null default 0 check \(version >= 0\)/i);
    expect(sql).toMatch(/item_count integer not null default 0 check \(item_count >= 0\)/i);
    expect(sql).toMatch(/file_size_bytes bigint check \(file_size_bytes is null or file_size_bytes >= 0\)/i);
  });

  it("regression: rejects a bare, unqualified reference form if it were reintroduced", () => {
    const vulnerableForm = /where\s+b\.id\s*=\s*bundle_id\s+and\s+b\.user_id\s*=\s*user_id/i;
    expect(sql).not.toMatch(vulnerableForm);
  });
});
