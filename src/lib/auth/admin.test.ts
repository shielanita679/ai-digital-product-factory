import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * requireAdmin()/assertAdmin() re-read profiles.role from the database on
 * EVERY call, via the caller's own session-scoped client (never cached,
 * never trusted from any input) — these tests assert exactly that: a
 * normal user is rejected, an admin is accepted, and the check always
 * goes through a fresh DB read rather than any client-supplied flag
 * (there is no such flag anywhere in this function's signature to trust
 * in the first place).
 */

class RedirectSignal extends Error {
  constructor(public path: string) {
    super(`REDIRECT:${path}`);
  }
}
const redirect = vi.fn((path: string) => {
  throw new RedirectSignal(path);
});
vi.mock("next/navigation", () => ({ redirect }));

let currentRole: string | null = "user";
const requireUser = vi.fn(async () => ({
  supabase: {
    from: (table: string) => ({
      select: (col: string) => ({
        eq: () => ({
          single: async () => {
            expect(table).toBe("profiles");
            expect(col).toBe("role");
            return { data: currentRole ? { role: currentRole } : null };
          },
        }),
      }),
    }),
  },
  user: { id: "u1" },
}));
vi.mock("@/lib/supabase/current-user", () => ({ requireUser }));

const { requireAdmin, assertAdmin, AdminRequiredError } = await import("@/lib/auth/admin");

beforeEach(() => {
  currentRole = "user";
  redirect.mockClear();
  requireUser.mockClear();
});

describe("requireAdmin — page/layout gate", () => {
  it("a normal user ('user' role) is redirected to /dashboard, never returns", async () => {
    await expect(requireAdmin()).rejects.toBeInstanceOf(RedirectSignal);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("a user with no profile row at all is redirected (fail closed, not fail open)", async () => {
    currentRole = null;
    await expect(requireAdmin()).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("an admin ('admin' role) is accepted and returns the session context", async () => {
    currentRole = "admin";
    const result = await requireAdmin();
    expect(result.user.id).toBe("u1");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("re-reads the role from the database on every call — never caches across calls", async () => {
    currentRole = "admin";
    await requireAdmin();
    currentRole = "user";
    await expect(requireAdmin()).rejects.toBeInstanceOf(RedirectSignal);
  });
});

describe("assertAdmin — Server Action gate", () => {
  it("throws AdminRequiredError for a normal user (never a redirect — Server Actions need a catchable error)", async () => {
    await expect(assertAdmin()).rejects.toBeInstanceOf(AdminRequiredError);
  });

  it("resolves normally for an admin", async () => {
    currentRole = "admin";
    await expect(assertAdmin()).resolves.toMatchObject({ user: { id: "u1" } });
  });
});
