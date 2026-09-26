import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ZERO real Supabase network calls in this file — the service-role client
 * is fully faked below, same convention as webhook-service.test.ts /
 * credit-service.test.ts.
 */

type Row = Record<string, unknown>;
let inserted: Row[] = [];

const createServiceRoleClient = vi.fn(() => ({
  from: (table: string) => ({
    insert: async (payload: Row) => {
      expect(table).toBe("analytics_events");
      inserted.push(payload);
      return { error: null };
    },
  }),
}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient }));

const captureException = vi.fn();
vi.mock("@/lib/errors/error-reporter", () => ({ ErrorReporter: { captureException, captureMessage: vi.fn() } }));

const { AnalyticsService } = await import("@/lib/analytics/analytics-service");

beforeEach(() => {
  inserted = [];
  captureException.mockClear();
});

describe("AnalyticsService.track — allowed events", () => {
  it("records an allowed event with the given user/project/metadata", async () => {
    await AnalyticsService.track({ eventName: "project_created", userId: "u1", projectId: "p1", metadata: { productType: "svg" } });
    expect(inserted).toEqual([{ user_id: "u1", project_id: "p1", event_name: "project_created", metadata: { productType: "svg" } }]);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("defaults project_id to null and metadata to {} when omitted", async () => {
    await AnalyticsService.track({ eventName: "onboarding_completed", userId: "u1" });
    expect(inserted).toEqual([{ user_id: "u1", project_id: null, event_name: "onboarding_completed", metadata: {} }]);
  });

  it("every catalog event name is accepted", async () => {
    const { ANALYTICS_EVENT_VALUES } = await import("@/config/analytics-events");
    for (const eventName of ANALYTICS_EVENT_VALUES) {
      await AnalyticsService.track({ eventName, userId: "u1" });
    }
    expect(inserted).toHaveLength(ANALYTICS_EVENT_VALUES.length);
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("AnalyticsService.track — rejects malformed/oversized/sensitive input, never throws", () => {
  it("an unknown event name is rejected and reported, never inserted", async () => {
    // @ts-expect-error deliberately invalid for the test
    await AnalyticsService.track({ eventName: "not_a_real_event", userId: "u1" });
    expect(inserted).toHaveLength(0);
    expect(captureException).toHaveBeenCalled();
  });

  it("missing userId is rejected and reported, never inserted", async () => {
    await AnalyticsService.track({ eventName: "project_created", userId: "" });
    expect(inserted).toHaveLength(0);
    expect(captureException).toHaveBeenCalled();
  });

  it("oversized metadata is rejected and reported, never inserted", async () => {
    const { ANALYTICS_METADATA_MAX_CHARS } = await import("@/config/analytics-events");
    await AnalyticsService.track({
      eventName: "project_created",
      userId: "u1",
      metadata: { huge: "x".repeat(ANALYTICS_METADATA_MAX_CHARS + 100) },
    });
    expect(inserted).toHaveLength(0);
    expect(captureException).toHaveBeenCalled();
  });

  it("metadata containing a forbidden key (e.g. password) is rejected and reported, never inserted or logged", async () => {
    await AnalyticsService.track({ eventName: "project_created", userId: "u1", metadata: { password: "hunter2" } });
    expect(inserted).toHaveLength(0);
    expect(captureException).toHaveBeenCalled();
    // The rejected value itself is never passed through to the DB insert.
    expect(JSON.stringify(inserted)).not.toContain("hunter2");
  });

  it("a nested forbidden key is also rejected", async () => {
    await AnalyticsService.track({ eventName: "project_created", userId: "u1", metadata: { nested: { token: "abc" } } });
    expect(inserted).toHaveLength(0);
  });

  it("a DB insert error is reported and swallowed, never thrown to the caller", async () => {
    createServiceRoleClient.mockReturnValueOnce({
      from: () => ({ insert: async () => ({ error: { message: "relation does not exist" } }) }),
    } as never);
    await expect(AnalyticsService.track({ eventName: "project_created", userId: "u1" })).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalled();
  });

  it("a thrown exception from the service-role client itself is swallowed, never thrown to the caller", async () => {
    createServiceRoleClient.mockImplementationOnce(() => {
      throw new Error("not configured");
    });
    await expect(AnalyticsService.track({ eventName: "project_created", userId: "u1" })).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalled();
  });
});
