import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 8 migration's raw SQL TEXT — not a live
 * database test (see supabase/tests/20260928_bundles_mockups_rls.sql for
 * that, deliberately not run here since the migration hasn't been
 * applied). Directly applies the Phase 7 lesson: product_bundles,
 * bundle_items, and designs all have a `user_id` column; product_bundles,
 * designs, and mockups all have a `project_id` column. Any correlated
 * EXISTS(...) subquery in these policies that leaves a reference to the
 * row-being-written unqualified is a live shadowing hazard — Postgres
 * resolves an unqualified identifier against the subquery's OWN FROM-list
 * first, silently turning an ownership check into a tautology. See
 * src/lib/vector/vectorizations-migration-rls.test.ts for the original
 * version of this guard (written after that exact bug was found live in
 * Phase 7) and 20260928000000_create_bundles_and_mockups.sql's own
 * top-of-file comment for the full writeup this migration was written
 * against from the start.
 */
const migrationPath = join(__dirname, "../../../supabase/migrations/20260928000000_create_bundles_and_mockups.sql");
const sql = readFileSync(migrationPath, "utf8");

function policyBlock(policyName: string, tableHint: string): string {
  // Several tables share policy names ("Users can create their own ..."
  // isn't quite unique in spirit across tables), so scope the search to
  // right after `alter table public.<tableHint>` to disambiguate.
  const tableSectionStart = sql.indexOf(`alter table public.${tableHint} enable row level security`);
  if (tableSectionStart === -1) throw new Error(`Table section not found: ${tableHint}`);
  const nextTableSection = sql.indexOf("alter table public.", tableSectionStart + 1);
  const section = sql.slice(tableSectionStart, nextTableSection === -1 ? undefined : nextTableSection);

  const start = section.indexOf(`create policy "${policyName}"`);
  if (start === -1) throw new Error(`Policy not found in ${tableHint} section: ${policyName}`);
  const end = section.indexOf(";", start);
  return section.slice(start, end + 1);
}

/** Every reference to the row's own columns inside an EXISTS(...) must be qualified as `<table>.<col>` — never bare. */
function expectFullyQualified(block: string, table: string, columns: string[]) {
  expect(block).toMatch(/exists\s*\(/i);
  for (const col of columns) {
    const qualified = new RegExp(`\\b${table}\\.${col}\\b`, "i");
    expect(block).toMatch(qualified);
  }

  const existsStart = block.search(/exists\s*\(/i);
  const subquery = block.slice(existsStart);
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

describe("20260928000000_create_bundles_and_mockups.sql — RLS ownership-consistency guard", () => {
  describe("product_bundles", () => {
    it("INSERT policy fully qualifies user_id/project_id references", () => {
      const block = policyBlock("Users can create their own bundles", "product_bundles");
      expect(block).toMatch(/for\s+insert/i);
      expectFullyQualified(block, "product_bundles", ["user_id", "project_id"]);
    });

    it("UPDATE policy's WITH CHECK fully qualifies user_id/project_id references", () => {
      const block = policyBlock("Users can update their own bundles", "product_bundles");
      const withCheckIndex = block.search(/with\s+check/i);
      expect(withCheckIndex).toBeGreaterThan(-1);
      expectFullyQualified(block.slice(withCheckIndex), "product_bundles", ["user_id", "project_id"]);
    });

    it("SELECT and DELETE remain simple owner-scoped policies", () => {
      const selectBlock = policyBlock("Users can view their own bundles", "product_bundles");
      const deleteBlock = policyBlock("Users can delete their own bundles", "product_bundles");
      expect(selectBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
      expect(deleteBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    });
  });

  describe("bundle_items", () => {
    it("INSERT policy fully qualifies user_id/bundle_id/design_id references and joins both product_bundles and designs", () => {
      const block = policyBlock("Users can create their own bundle items", "bundle_items");
      expect(block).toMatch(/for\s+insert/i);
      expect(block).toMatch(/from\s+public\.product_bundles\s+b/i);
      expect(block).toMatch(/join\s+public\.designs\s+d/i);
      expectFullyQualified(block, "bundle_items", ["user_id", "bundle_id", "design_id"]);
    });

    it("UPDATE policy's WITH CHECK fully qualifies every outer-row reference", () => {
      const block = policyBlock("Users can update their own bundle items", "bundle_items");
      const withCheckIndex = block.search(/with\s+check/i);
      expect(withCheckIndex).toBeGreaterThan(-1);
      expectFullyQualified(block.slice(withCheckIndex), "bundle_items", ["user_id", "bundle_id", "design_id"]);
    });

    it("cross-checks the design's project_id against the bundle's project_id (blocks a same-user wrong-project attachment)", () => {
      const block = policyBlock("Users can create their own bundle items", "bundle_items");
      expect(block).toMatch(/d\.project_id\s*=\s*b\.project_id/i);
    });
  });

  describe("mockups", () => {
    it("INSERT policy fully qualifies user_id/bundle_id/design_id/project_id references", () => {
      const block = policyBlock("Users can create their own mockups", "mockups");
      expect(block).toMatch(/for\s+insert/i);
      expectFullyQualified(block, "mockups", ["user_id", "bundle_id", "design_id", "project_id"]);
    });

    it("UPDATE policy's WITH CHECK fully qualifies every outer-row reference", () => {
      const block = policyBlock("Users can update their own mockups", "mockups");
      const withCheckIndex = block.search(/with\s+check/i);
      expect(withCheckIndex).toBeGreaterThan(-1);
      expectFullyQualified(block.slice(withCheckIndex), "mockups", ["user_id", "bundle_id", "design_id", "project_id"]);
    });

    it("cross-checks the denormalized mockups.project_id against BOTH the bundle's and the design's actual project_id", () => {
      const block = policyBlock("Users can create their own mockups", "mockups");
      expect(block).toMatch(/b\.project_id\s*=\s*mockups\.project_id/i);
      expect(block).toMatch(/d\.project_id\s*=\s*mockups\.project_id/i);
    });
  });

  it("RLS is enabled on all three tables", () => {
    expect(sql).toMatch(/alter table public\.product_bundles enable row level security/i);
    expect(sql).toMatch(/alter table public\.bundle_items enable row level security/i);
    expect(sql).toMatch(/alter table public\.mockups enable row level security/i);
  });

  it("bundle_items has a unique(bundle_id, design_id) constraint", () => {
    expect(sql).toMatch(/constraint bundle_items_bundle_design_unique unique \(bundle_id, design_id\)/i);
  });

  it("mockups has a unique(bundle_id, design_id, template_type) constraint", () => {
    expect(sql).toMatch(/constraint mockups_bundle_design_template_unique unique \(bundle_id, design_id, template_type\)/i);
  });
});
