import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A STATIC test on the Phase 12 migration's raw SQL TEXT — not a live
 * database test (mirrors the established pattern in
 * bundles-migration-rls.test.ts / vectorizations-migration-rls.test.ts).
 * Guards the two security-critical properties this migration introduces:
 * (1) `profiles.role` cannot be self-assigned — the column-level
 * REVOKE/GRANT must exclude `role` from the authenticated column
 * allowlist; (2) the three new operational tables (analytics_events,
 * rate_limits, application_errors) have RLS enabled with ZERO policies —
 * denying every authenticated/anon operation regardless of the default
 * project-level table grant, same as stripe_webhook_events; and (3)
 * check_rate_limit() follows the exact same service-role-only,
 * qualified-column SECURITY DEFINER pattern established by
 * credit_ledger_apply().
 */
const migrationPath = join(
  __dirname,
  "../../../supabase/migrations/20261010000000_add_admin_analytics_rate_limits_errors.sql",
);
const sql = readFileSync(migrationPath, "utf8");

describe("20261010000000 — profiles.role self-escalation guard", () => {
  it("adds a role column defaulting to 'user', constrained to ('user','admin')", () => {
    expect(sql).toMatch(/add column if not exists role text not null default 'user' check \(role in \('user', 'admin'\)\)/i);
  });

  it("revokes table-wide UPDATE on profiles from authenticated and anon", () => {
    expect(sql).toMatch(/revoke update on public\.profiles from authenticated, anon/i);
  });

  it("re-grants UPDATE only on the safe columns, and the column list EXCLUDES role/id/email/created_at", () => {
    const match = sql.match(/grant update \(([^)]+)\)\s*\n?\s*on public\.profiles to authenticated/i);
    expect(match).not.toBeNull();
    const columns = (match?.[1] ?? "").split(",").map((c) => c.trim());
    expect(columns).toEqual(
      expect.arrayContaining(["full_name", "avatar_url", "sells_what", "sells_where", "monthly_product_volume", "onboarding_completed"]),
    );
    expect(columns).not.toContain("role");
    expect(columns).not.toContain("id");
    expect(columns).not.toContain("email");
    expect(columns).not.toContain("created_at");
  });
});

describe("20261010000000 — zero-policy tables (analytics_events, rate_limits, application_errors)", () => {
  for (const table of ["analytics_events", "rate_limits", "application_errors"]) {
    it(`${table}: RLS is enabled`, () => {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    });

    it(`${table}: no "create policy" statement exists for this table (zero-policy, service-role only)`, () => {
      const tableSectionStart = sql.search(new RegExp(`create table if not exists public\\.${table}`, "i"));
      expect(tableSectionStart).toBeGreaterThan(-1);
      const rlsIndex = sql.indexOf(`alter table public.${table} enable row level security`, tableSectionStart);
      expect(rlsIndex).toBeGreaterThan(-1);
      // No table's own policy is created anywhere for this table name at all.
      expect(sql).not.toMatch(new RegExp(`create policy[^;]*on public\\.${table}`, "i"));
    });
  }
});

describe("20261010000000 — check_rate_limit() SECURITY DEFINER function", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    const start = sql.indexOf("create or replace function public.check_rate_limit");
    expect(start).toBeGreaterThan(-1);
    const end = sql.indexOf("$$;", start);
    const body = sql.slice(start, end);
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path = public, pg_temp/i);
  });

  it("qualifies every rate_limits column reference inside the function (no bare `count`)", () => {
    const start = sql.indexOf("create or replace function public.check_rate_limit");
    const end = sql.indexOf("$$;", start);
    const body = sql.slice(start, end);
    expect(body).toMatch(/do update set count = rate_limits\.count \+ 1/i);
    expect(body).toMatch(/returning rate_limits\.count into v_count/i);
  });

  it("uses a single atomic INSERT ... ON CONFLICT ... RETURNING statement (no separate read-then-write)", () => {
    const start = sql.indexOf("create or replace function public.check_rate_limit");
    const end = sql.indexOf("$$;", start);
    const body = sql.slice(start, end);
    expect(body).toMatch(/insert into public\.rate_limits/i);
    expect(body).toMatch(/on conflict \(user_id, operation, window_start\)/i);
    expect(body).toMatch(/do update set/i);
    // Never a bare SELECT of the current count before the insert/update.
    expect(body).not.toMatch(/select\s+count\s+from\s+public\.rate_limits/i);
  });

  it("revokes EXECUTE from public/anon/authenticated (three roles named explicitly) and grants only to service_role", () => {
    expect(sql).toMatch(
      /revoke all on function public\.check_rate_limit\(uuid, text, int, int\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/grant execute on function public\.check_rate_limit\(uuid, text, int, int\) to service_role/i);
  });

  it("the window bucket is computed from now(), never from a caller-supplied timestamp", () => {
    const start = sql.indexOf("create or replace function public.check_rate_limit");
    const end = sql.indexOf("$$;", start);
    const body = sql.slice(start, end);
    expect(body).toMatch(/v_window_start := to_timestamp\(floor\(extract\(epoch from now\(\)\)/i);
  });
});

describe("20261010000000 — size caps (defense in depth beyond application-layer checks)", () => {
  it("analytics_events.metadata has a size CHECK constraint", () => {
    expect(sql).toMatch(/constraint analytics_events_metadata_size check \(char_length\(metadata::text\) < 2000\)/i);
  });

  it("application_errors.message and context have size CHECK constraints", () => {
    expect(sql).toMatch(/constraint application_errors_message_size check \(char_length\(message\) < 4000\)/i);
    expect(sql).toMatch(/constraint application_errors_context_size check \(char_length\(context::text\) < 4000\)/i);
  });
});

describe("20261010000000 — signup analytics trigger does not edit the already-applied handle_new_user()", () => {
  it("defines a SEPARATE track_signup_analytics() function/trigger, not a modification of handle_new_user", () => {
    expect(sql).not.toMatch(/create or replace function public\.handle_new_user/i);
    expect(sql).toMatch(/create or replace function public\.track_signup_analytics/i);
    expect(sql).toMatch(/create trigger on_auth_user_created_track_analytics/i);
  });

  it("the trigger function swallows its own errors (never blocks a real signup)", () => {
    const start = sql.indexOf("create or replace function public.track_signup_analytics");
    const end = sql.indexOf("$$;", start);
    const body = sql.slice(start, end);
    expect(body).toMatch(/exception when others then/i);
  });
});
