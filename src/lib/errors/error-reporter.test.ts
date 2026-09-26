import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
let inserted: Row[] = [];
let shouldThrowOnInsert = false;

const createServiceRoleClient = vi.fn(() => ({
  from: (table: string) => ({
    insert: async (payload: Row) => {
      if (shouldThrowOnInsert) throw new Error("db unreachable");
      expect(table).toBe("application_errors");
      inserted.push(payload);
      return { error: null };
    },
  }),
}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient }));

const { ErrorReporter, redact } = await import("@/lib/errors/error-reporter");

beforeEach(() => {
  inserted = [];
  shouldThrowOnInsert = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("redact — secret redaction", () => {
  it("redacts a top-level password/token/secret key", () => {
    const result = redact({ password: "hunter2", token: "abc", secret: "xyz" }) as Record<string, unknown>;
    expect(result.password).toBe("[REDACTED]");
    expect(result.token).toBe("[REDACTED]");
    expect(result.secret).toBe("[REDACTED]");
  });

  it("redacts Stripe-specific and cookie/authorization keys", () => {
    const result = redact({
      stripe_signature: "t=1,v1=abc",
      "stripe-signature": "t=1,v1=abc",
      authorization: "Bearer abc",
      cookie: "session=abc",
      service_role_key: "sb_secret_abc",
    }) as Record<string, unknown>;
    for (const key of Object.keys(result)) {
      expect(result[key]).toBe("[REDACTED]");
    }
  });

  it("redacts a NESTED forbidden key at any depth", () => {
    const result = redact({ outer: { inner: { access_token: "abc", safe: "ok" } } }) as Record<string, unknown>;
    const outer = result.outer as Record<string, unknown>;
    const inner = outer.inner as Record<string, unknown>;
    expect(inner.access_token).toBe("[REDACTED]");
    expect(inner.safe).toBe("ok");
  });

  it("redacts a forbidden key inside an array of objects", () => {
    const result = redact({ items: [{ apikey: "abc" }, { safe: "ok" }] }) as { items: Record<string, unknown>[] };
    expect(result.items[0].apikey).toBe("[REDACTED]");
    expect(result.items[1].safe).toBe("ok");
  });

  it("truncates an overly long string instead of persisting it whole", () => {
    const result = redact("x".repeat(1000)) as string;
    expect(result.length).toBeLessThan(1000);
    expect(result).toContain("[TRUNCATED]");
  });

  it("truncates deeply nested structures beyond the max depth", () => {
    let deep: unknown = { value: "leaf" };
    for (let i = 0; i < 10; i++) deep = { nested: deep };
    const result = redact(deep);
    expect(JSON.stringify(result)).toContain("[TRUNCATED]");
  });

  it("caps array length rather than persisting an unbounded array", () => {
    const result = redact(Array.from({ length: 500 }, (_, i) => i)) as unknown[];
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("passes through safe primitives unchanged", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
  });
});

describe("ErrorReporter.captureException — safe context serialization + persistence", () => {
  it("logs to console.error and persists a redacted row", async () => {
    ErrorReporter.captureException(new Error("boom"), { route: "test-route", userId: "u1", metadata: { password: "hunter2", ok: "fine" } });
    await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget persist() settle
    expect(console.error).toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].level).toBe("exception");
    expect(inserted[0].route).toBe("test-route");
    expect(inserted[0].user_id).toBe("u1");
    expect(JSON.stringify(inserted[0].context)).not.toContain("hunter2");
    expect(JSON.stringify(inserted[0].context)).toContain("fine");
  });

  it("accepts a non-Error value (string, object) without throwing", () => {
    expect(() => ErrorReporter.captureException("a plain string error")).not.toThrow();
    expect(() => ErrorReporter.captureException({ weird: "shape" })).not.toThrow();
  });

  it("a persistence failure (DB insert throws) never crashes the caller — this IS the primary requirement", async () => {
    shouldThrowOnInsert = true;
    expect(() => ErrorReporter.captureException(new Error("boom"))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    // No exception escaped, and nothing was recorded (persist swallowed internally) — but the caller's own flow was never interrupted.
    expect(inserted).toHaveLength(0);
  });

  it("a completely unavailable service-role client (throws on construction) never crashes the caller", async () => {
    createServiceRoleClient.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SECRET_KEY not configured");
    });
    expect(() => ErrorReporter.captureException(new Error("boom"))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("ErrorReporter.captureMessage", () => {
  it("logs to console.warn and persists as level:message", async () => {
    ErrorReporter.captureMessage("something worth noting", { route: "test-route" });
    await new Promise((r) => setTimeout(r, 0));
    expect(console.warn).toHaveBeenCalled();
    expect(inserted[0].level).toBe("message");
  });
});
