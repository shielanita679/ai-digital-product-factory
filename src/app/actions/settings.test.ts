import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mirrors billing.test.ts's convention: every dependency mocked, zero real
 * network calls. Verifies the three Settings requirements from the Phase
 * 12 spec: an owner can update their own allowed fields, cannot target
 * another user's row (identity is always server-derived from
 * requireUser(), never trusted from input), and cannot escalate role
 * (the schema doesn't even have a `role` field, so it can never reach the
 * update payload regardless of what a caller includes in `input`).
 */

type UpdatePayload = Record<string, unknown>;
let lastUpdatePayload: UpdatePayload | null = null;
let lastEqArgs: [string, unknown] | null = null;
let updateError: { message: string } | null = null;

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

const { updateProfileSettingsAction } = await import("@/app/actions/settings");

const VALID_INPUT = {
  fullName: "Jamie Rivera",
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
});

describe("updateProfileSettingsAction — owner can update own allowed fields", () => {
  it("saves full_name/sells_what/sells_where/monthly_product_volume for the server-derived user", async () => {
    const result = await updateProfileSettingsAction(VALID_INPUT);
    expect(result).toEqual({ ok: true });
    expect(lastUpdatePayload).toEqual({
      full_name: "Jamie Rivera",
      sells_what: ["svg_designs"],
      sells_where: ["etsy"],
      monthly_product_volume: "1_10",
    });
    expect(lastEqArgs).toEqual(["id", USER_ID]);
  });

  it("rejects invalid input before ever calling the database", async () => {
    const result = await updateProfileSettingsAction({ ...VALID_INPUT, fullName: "" });
    expect(result.ok).toBe(false);
    expect(lastUpdatePayload).toBeNull();
  });

  it("surfaces a DB error message", async () => {
    updateError = { message: "connection reset" };
    const result = await updateProfileSettingsAction(VALID_INPUT);
    expect(result).toEqual({ ok: false, error: "connection reset" });
  });
});

describe("updateProfileSettingsAction — cannot target another user's row", () => {
  it("always scopes the update to the server-derived user id, never a client-supplied one", async () => {
    await updateProfileSettingsAction({ ...VALID_INPUT, userId: "attacker-controlled-id", id: "attacker-controlled-id" });
    expect(lastEqArgs).toEqual(["id", USER_ID]);
  });
});

describe("updateProfileSettingsAction — cannot escalate role", () => {
  it("a caller-supplied role/id/email in input never reaches the update payload", async () => {
    await updateProfileSettingsAction({ ...VALID_INPUT, role: "admin", id: "someone-else", email: "new@example.com" });
    expect(lastUpdatePayload).not.toHaveProperty("role");
    expect(lastUpdatePayload).not.toHaveProperty("id");
    expect(lastUpdatePayload).not.toHaveProperty("email");
    expect(Object.keys(lastUpdatePayload ?? {}).sort()).toEqual(
      ["full_name", "monthly_product_volume", "sells_what", "sells_where"].sort(),
    );
  });
});
