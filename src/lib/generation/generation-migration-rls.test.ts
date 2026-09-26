import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 5 migration's raw SQL TEXT — not a live
 * database test (same convention as bundles-migration-rls.test.ts /
 * vectorizations-migration-rls.test.ts). This is the one confirmed gap
 * found during Phase 13's test-coverage audit: every later phase's
 * ownership tables (vectorizations, bundles/mockups, listings, packages)
 * already have a static RLS regression guard — generation_jobs/designs,
 * the foundational tables every later phase's ownership policies build
 * on, did not.
 *
 * Unlike vectorizations/bundles/mockups, generation_jobs and designs have
 * NO cross-table EXISTS(...) ownership check to get wrong — both are
 * simple, directly-owned tables (own `user_id` column only, no
 * project_id/bundle_id cross-reference to validate at the RLS layer;
 * project ownership is validated in application code, confirmed via the
 * Phase 13 security audit's IDOR review) — so these assertions are
 * simpler than the EXISTS-based guards elsewhere, matching what's
 * actually in this migration.
 */
const migrationPath = join(__dirname, "../../../supabase/migrations/20260924000000_create_generation_pipeline.sql");
const sql = readFileSync(migrationPath, "utf8");

function policyBlock(sql: string, policyName: string): string {
  const start = sql.indexOf(`create policy "${policyName}"`);
  if (start === -1) throw new Error(`Policy not found: ${policyName}`);
  const end = sql.indexOf(";", start);
  return sql.slice(start, end + 1);
}

describe("20260924000000_create_generation_pipeline.sql — RLS ownership guard", () => {
  describe("generation_jobs", () => {
    it("RLS is enabled", () => {
      expect(sql).toMatch(/alter table public\.generation_jobs enable row level security/i);
    });

    it("SELECT/INSERT/UPDATE/DELETE are all simple owner-scoped policies (auth.uid() = user_id, no EXISTS needed)", () => {
      const selectBlock = policyBlock(sql, "Users can view their own generation jobs");
      const insertBlock = policyBlock(sql, "Users can create their own generation jobs");
      const updateBlock = policyBlock(sql, "Users can update their own generation jobs");
      const deleteBlock = policyBlock(sql, "Users can delete their own generation jobs");

      expect(selectBlock).toMatch(/for\s+select/i);
      expect(selectBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);

      expect(insertBlock).toMatch(/for\s+insert/i);
      expect(insertBlock).toMatch(/with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);

      expect(updateBlock).toMatch(/for\s+update/i);
      expect(updateBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
      expect(updateBlock).toMatch(/with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);

      expect(deleteBlock).toMatch(/for\s+delete/i);
      expect(deleteBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    });

    it("has the partial unique index enforcing one active job (queued/processing) per project", () => {
      expect(sql).toMatch(
        /create unique index if not exists idx_one_active_generation_job_per_project\s+on public\.generation_jobs \(project_id\)\s+where status in \('queued', 'processing'\)/i,
      );
    });
  });

  describe("designs", () => {
    it("RLS is enabled", () => {
      expect(sql).toMatch(/alter table public\.designs enable row level security/i);
    });

    it("SELECT/INSERT/UPDATE/DELETE are all simple owner-scoped policies (auth.uid() = user_id, no EXISTS needed)", () => {
      const selectBlock = policyBlock(sql, "Users can view their own designs");
      const insertBlock = policyBlock(sql, "Users can create their own designs");
      const updateBlock = policyBlock(sql, "Users can update their own designs");
      const deleteBlock = policyBlock(sql, "Users can delete their own designs");

      expect(selectBlock).toMatch(/for\s+select/i);
      expect(selectBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);

      expect(insertBlock).toMatch(/for\s+insert/i);
      expect(insertBlock).toMatch(/with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);

      expect(updateBlock).toMatch(/for\s+update/i);
      expect(updateBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
      expect(updateBlock).toMatch(/with\s+check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);

      expect(deleteBlock).toMatch(/for\s+delete/i);
      expect(deleteBlock).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
    });

    it("has a unique(generation_job_id, variation_index) constraint (no duplicate variation within a job)", () => {
      expect(sql).toMatch(/constraint designs_unique_variation_per_job unique \(generation_job_id, variation_index\)/i);
    });
  });
});
