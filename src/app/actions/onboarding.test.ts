import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Previously untested at all. Mirrors settings.test.ts's convention: every
 * dependency mocked, zero real network calls. Covers ownership scoping
 * (always the server-derived user id) and the Phase 13 fix — this action
 * used to return a raw error.message instead of routing through
 * friendlyDbErrorMessage, unlike every other action in the codebase.
 */

type UpdatePayload = Record<string, unknown>;
let lastUpdatePayload: UpdatePayload | null = null;
let lastEqArgs: [string, unknown] | null = null;
let updateError: { message: string; code?: string } | null = null;

const USER_ID = "55555555-5555-5555-5555-555555555555";
const requireUser = vi.fn(async () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: UpdatePayload) => ({
        eq: async (col: string, val: unknown) => {
          expect(table).toBe("profiles");
          lastUpdatePayload = payload;
          lastEqArgs = [col, val];
          return { error: updateError };
        },
      }),
    }),
  },
  user: { id: USER_ID },
}));
vi.mock("@/lib/supabase/current-user", () => ({ requireUser }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

class RedirectSignal extends Error {
  constructor(public path: string) {
    super(`REDIRECT:${path}`);
  }
}
const redirect = vi.fn((path: string) => {
  throw new RedirectSignal(path);
});
vi.mock("next/navigation", () => ({ redirect }));

const track = vi.fn();
vi.mock("@/lib/analytics/analytics-service", () => ({ AnalyticsService: { track } }));

const { saveOnboardingAction } = await import("@/app/actions/onboarding");

const VALID_INPUT = {
  sellsWhat: ["svg_designs"],
  sellsWhere: ["etsy"],
  monthlyVolume: "1_10",
};

beforeEach(() => {
  lastUpdatePayload = null;
  lastEqArgs = null;
  updateError = null;
  requireUser.mockClear();
  revalidatePath.mockClear();
  redirect.mockClear();
  track.mockClear();
});

describe("saveOnboardingAction", () => {
  it("rejects invalid input before ever calling the database", async () => {
    const result = await saveOnboardingAction({});
    expect(result?.ok).toBe(false);
    expect(lastUpdatePayload).toBeNull();
  });

  it("scopes the update to the server-derived user id, never a client-supplied one, and redirects on success", async () => {
    await expect(saveOnboardingAction({ ...VALID_INPUT, id: "attacker-controlled" })).rejects.toBeInstanceOf(RedirectSignal);
    expect(lastEqArgs).toEqual(["id", USER_ID]);
    expect(lastUpdatePayload).toEqual({
      sells_what: ["svg_designs"],
      sells_where: ["etsy"],
      monthly_product_volume: "1_10",
      onboarding_completed: true,
    });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("surfaces a plain DB error message", async () => {
    updateError = { message: "connection reset" };
    const result = await saveOnboardingAction(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "connection reset" });
  });

  // Phase 13 fix: previously returned the raw error.message directly.
  it("shows the friendly migration-not-applied message for a PGRST205 error, not the raw PostgREST message", async () => {
    updateError = { message: "Could not find the table 'public.profiles' in the schema cache", code: "PGRST205" };
    const result = await saveOnboardingAction(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/database migration.*hasn't been applied/i);
      expect(result.error).not.toContain("schema cache");
    }
  });
});
