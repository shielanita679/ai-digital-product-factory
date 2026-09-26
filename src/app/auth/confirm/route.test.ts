import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level test for the signup-confirmation/password-recovery landing
 * point — previously untested (Phase 13 test-coverage audit). Focuses on
 * the Phase 13 fix: the original `type` must be carried through onto the
 * `/auth/auth-code-error` fallback redirect so that page can show
 * signup-appropriate vs. recovery-appropriate copy, instead of dropping it
 * and always showing the same generic message. `supabase.auth.verifyOtp`
 * is mocked — zero real Supabase network calls.
 */

const verifyOtp = vi.fn();
const createClient = vi.fn(async () => ({ auth: { verifyOtp } }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { GET } = await import("@/app/auth/confirm/route");

function makeRequest(query: string) {
  return new Request(`http://localhost:3000/auth/confirm${query}`) as never;
}

beforeEach(() => {
  verifyOtp.mockReset();
  createClient.mockClear();
});

describe("GET /auth/confirm — success path", () => {
  it("verifies the token and redirects to `next` on success", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(makeRequest("?token_hash=abc123&type=signup&next=/onboarding"));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "abc123" });
    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("falls back to /dashboard when no safe `next` is supplied", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(makeRequest("?token_hash=abc123&type=recovery"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("rejects an unsafe `next` (open-redirect attempt) via safeRedirectPath, falling back to /dashboard", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(makeRequest("?token_hash=abc123&type=signup&next=https://evil.example.com"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });
});

describe("GET /auth/confirm — failure path carries `type` through to the error page", () => {
  it("a failed verifyOtp for type=signup redirects to auth-code-error with ?type=signup", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const response = await GET(makeRequest("?token_hash=abc123&type=signup&next=/onboarding"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/auth-code-error");
    expect(location.searchParams.get("type")).toBe("signup");
  });

  it("a failed verifyOtp for type=recovery redirects to auth-code-error with ?type=recovery", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const response = await GET(makeRequest("?token_hash=abc123&type=recovery&next=/reset-password"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/auth-code-error");
    expect(location.searchParams.get("type")).toBe("recovery");
  });

  it("missing token_hash/type redirects to auth-code-error with NO type param (nothing to carry through)", async () => {
    const response = await GET(makeRequest(""));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/auth-code-error");
    expect(location.searchParams.has("type")).toBe(false);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("a thrown exception (e.g. Supabase not configured) still redirects to auth-code-error with `type` carried through", async () => {
    verifyOtp.mockRejectedValue(new Error("Supabase not configured"));
    const response = await GET(makeRequest("?token_hash=abc123&type=email&next=/onboarding"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/auth-code-error");
    expect(location.searchParams.get("type")).toBe("email");
  });
});
