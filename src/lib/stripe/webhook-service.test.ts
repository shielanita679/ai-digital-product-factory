import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

/**
 * ZERO Stripe network calls anywhere in this file (Phase 11 spec section
 * 39/40). Signature generation/verification (stripe.webhooks.*) is pure
 * local HMAC crypto — no network involved — and every other Stripe SDK
 * call (subscriptions.retrieve) is mocked below. Real, unfaked local
 * Stripe.Event fixtures are used so the dispatcher's field access (e.g.
 * invoice.parent.subscription_details.subscription) is checked against
 * shapes the installed SDK's own types actually produce, not guessed.
 */

const retrieveSubscription = vi.fn();
vi.mock("@/lib/stripe/stripe-client", () => ({
  // A REAL Stripe SDK instance (so .webhooks.constructEvent does real,
  // unmocked local signature verification — zero network either way),
  // with only .subscriptions.retrieve swapped for the controlled fake.
  getStripeClient: () => {
    const real = new Stripe("sk_test_fixture", { apiVersion: "2026-08-26.dahlia" });
    return Object.assign(real, { subscriptions: { retrieve: retrieveSubscription } });
  },
}));

// Phase 12: customer.subscription.created now fires
// AnalyticsService.track("subscription_activated"), which creates its own
// service-role client internally — mocked here purely so this file makes
// ZERO real Supabase network calls (AnalyticsService already fails
// safe/swallows when the client doesn't behave like a real one).
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));

const { processWebhookEvent, verifyWebhookSignature, WebhookServiceError } = await import("@/lib/stripe/webhook-service");
const { StripeNotConfiguredError, StripeLiveModeRejectedError } = await import("@/lib/stripe/stripe-env");

const ORIGINAL_ENV = { ...process.env };
const TEST_SECRET = "sk_test_fixture";
const TEST_WEBHOOK_SECRET = "whsec_test_fixture_secret";

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: TEST_SECRET, STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET };
  retrieveSubscription.mockReset();
});

describe("verifyWebhookSignature", () => {
  const payload = JSON.stringify({ id: "evt_test_1", object: "event", type: "ping" });

  it("accepts a validly signed payload", () => {
    const stripe = new Stripe(TEST_SECRET, { apiVersion: "2026-08-26.dahlia" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });
    const event = verifyWebhookSignature(payload, header);
    expect(event.id).toBe("evt_test_1");
  });

  it("rejects a payload signed with the WRONG secret", () => {
    const stripe = new Stripe(TEST_SECRET, { apiVersion: "2026-08-26.dahlia" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_totally_different" });
    expect(() => verifyWebhookSignature(payload, header)).toThrow(WebhookServiceError);
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const stripe = new Stripe(TEST_SECRET, { apiVersion: "2026-08-26.dahlia" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET });
    const tamperedPayload = JSON.stringify({ id: "evt_test_1_HACKED", object: "event", type: "ping" });
    expect(() => verifyWebhookSignature(tamperedPayload, header)).toThrow(WebhookServiceError);
  });

  it("rejects a missing signature header", () => {
    expect(() => verifyWebhookSignature(payload, null)).toThrow(WebhookServiceError);
    try {
      verifyWebhookSignature(payload, null);
    } catch (err) {
      expect((err as InstanceType<typeof WebhookServiceError>).code).toBe("missing_signature");
    }
  });

  it("rejects when STRIPE_WEBHOOK_SECRET is not configured", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => verifyWebhookSignature(payload, "t=1,v1=fake")).toThrow(WebhookServiceError);
  });

  it("rejects outright when Stripe isn't configured at all", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => verifyWebhookSignature(payload, "t=1,v1=fake")).toThrow(StripeNotConfiguredError);
  });

  it("rejects a live-mode secret key even for webhook verification — the test-mode guard applies everywhere", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_dangerous";
    expect(() => verifyWebhookSignature(payload, "t=1,v1=fake")).toThrow(StripeLiveModeRejectedError);
  });
});

type Row = Record<string, unknown>;
type Db = { stripe_webhook_events: Row[]; subscriptions: Row[]; credit_accounts: Row[]; credit_ledger: Row[] };

function makeFakeSupabase(db: Db) {
  return {
    from(table: keyof Db) {
      return {
        insert: (payload: Row) => ({
          select: () => ({
            maybeSingle: async () => {
              if (db[table].some((r) => r.stripe_event_id === payload.stripe_event_id)) {
                return { data: null, error: { code: "23505", message: "duplicate" } };
              }
              const row = { id: `row_${db[table].length + 1}`, created_at: new Date().toISOString(), ...payload };
              db[table].push(row);
              return { data: row, error: null };
            },
          }),
        }),
        select: () => ({
          eq: (col: string, val: unknown) => ({
            single: async () => {
              const row = db[table].find((r) => r[col] === val);
              return row ? { data: row, error: null } : { data: null, error: { message: "not found" } };
            },
            maybeSingle: async () => {
              const row = db[table].find((r) => r[col] === val);
              return { data: row ?? null, error: null };
            },
          }),
        }),
        update: (payload: Row) => ({
          eq: async (col: string, val: unknown) => {
            const row = db[table].find((r) => r[col] === val);
            if (row) Object.assign(row, payload);
            return { data: row ? [row] : [], error: null };
          },
        }),
        upsert: async (payload: Row) => {
          const existing = db[table].find((r) => r.user_id === payload.user_id);
          if (existing) Object.assign(existing, payload);
          else db[table].push({ id: `row_${db[table].length + 1}`, ...payload });
          return { data: null, error: null };
        },
      };
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      expect(fn).toBe("credit_ledger_apply");
      const userId = args.p_user_id as string;
      const amount = args.p_amount as number;
      const key = args.p_idempotency_key as string;
      const existingEntry = db.credit_ledger.find((r) => r.idempotency_key === key);
      if (existingEntry) {
        const acct = db.credit_accounts.find((a) => a.user_id === userId);
        return { data: [{ ledger_id: existingEntry.id, balance: acct?.balance ?? 0, was_duplicate: true }], error: null };
      }
      let acct = db.credit_accounts.find((a) => a.user_id === userId);
      if (!acct) {
        acct = { user_id: userId, balance: 0 };
        db.credit_accounts.push(acct);
      }
      acct.balance = (acct.balance as number) + amount;
      const id = `ledger_${db.credit_ledger.length + 1}`;
      db.credit_ledger.push({ id, user_id: userId, amount, entry_type: args.p_entry_type, idempotency_key: key });
      return { data: [{ ledger_id: id, balance: acct.balance, was_duplicate: false }], error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal test double, not a real SupabaseClient
  } as any;
}

function emptyDb(): Db {
  return { stripe_webhook_events: [], subscriptions: [], credit_accounts: [], credit_ledger: [] };
}

function makeEvent<T>(id: string, type: string, object: T): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

describe("processWebhookEvent — duplicate/unknown event handling", () => {
  it("processes a new event and marks it processed", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    const event = makeEvent("evt_1", "some.unhandled.type", {});
    const result = await processWebhookEvent(supabase, event);
    expect(result.outcome).toBe("processed");
    expect(db.stripe_webhook_events[0].status).toBe("processed");
  });

  it("a duplicate delivery of an already-processed event is skipped, not reprocessed", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    const event = makeEvent("evt_2", "some.unhandled.type", {});
    await processWebhookEvent(supabase, event);
    const second = await processWebhookEvent(supabase, event);
    expect(second.outcome).toBe("skipped_duplicate");
    expect(db.stripe_webhook_events).toHaveLength(1);
  });

  it("an unknown event type is acknowledged (processed) with no side effects", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    const event = makeEvent("evt_3", "some.totally.unknown.event", { foo: "bar" });
    const result = await processWebhookEvent(supabase, event);
    expect(result.outcome).toBe("processed");
    expect(db.subscriptions).toHaveLength(0);
    expect(db.credit_ledger).toHaveLength(0);
  });

  it("a failed handler marks the event 'failed', and a subsequent retry of the SAME event id is reprocessed (not permanently stuck)", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    // invoice.paid with a subscription reference that will make stripe.subscriptions.retrieve throw once.
    retrieveSubscription.mockRejectedValueOnce(new Error("simulated transient Stripe error"));
    const invoice = { id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } };
    const event = makeEvent("evt_4", "invoice.paid", invoice);

    const first = await processWebhookEvent(supabase, event);
    expect(first.outcome).toBe("failed");
    expect(db.stripe_webhook_events[0].status).toBe("failed");
    expect(db.stripe_webhook_events[0].error_message).toContain("simulated transient Stripe error");

    // Retry: this time the Stripe call succeeds.
    retrieveSubscription.mockResolvedValueOnce({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      cancel_at_period_end: false,
      metadata: { user_id: "u1" },
      items: { data: [{ price: { id: "price_starter" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
    });
    const second = await processWebhookEvent(supabase, event);
    expect(second.outcome).toBe("processed");
    expect(db.stripe_webhook_events[0].status).toBe("processed");
    expect(db.stripe_webhook_events).toHaveLength(1); // still ONE row for this event id, not a duplicate
  });
});

describe("processWebhookEvent — subscription lifecycle sync", () => {
  const subscriptionFixture = {
    id: "sub_100",
    customer: "cus_100",
    status: "active",
    cancel_at_period_end: false,
    metadata: { user_id: "u1" },
    items: { data: [{ price: { id: "price_starter" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
  };

  /**
   * SECURITY/CORRECTNESS (post-live-verification fix): customer.subscription.*
   * webhooks now ALWAYS re-fetch fresh from Stripe (via the mocked
   * retrieveSubscription) rather than trusting the event's own embedded
   * `data.object` snapshot — these tests assert that by making the fixture's
   * `data.object` and the mocked retrieve's return value DIFFER, and
   * checking that the DB ends up with the RETRIEVE's value, never the
   * event payload's own value.
   */

  it("customer.subscription.created syncs the subscriptions table from a FRESH Stripe retrieve, not the event payload", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce(subscriptionFixture);
    // The event payload itself claims a DIFFERENT status — must be ignored.
    const event = makeEvent("evt_10", "customer.subscription.created", { ...subscriptionFixture, id: "sub_100", status: "past_due" });
    const result = await processWebhookEvent(supabase, event);
    expect(result.outcome).toBe("processed");
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_100");
    expect(db.subscriptions[0]).toMatchObject({ user_id: "u1", stripe_subscription_id: "sub_100", status: "active" }); // from the retrieve, not the payload's "past_due"
  });

  it("customer.subscription.updated updates the SAME row, not a duplicate, using the fresh retrieve's value", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce(subscriptionFixture);
    await processWebhookEvent(supabase, makeEvent("evt_11", "customer.subscription.created", subscriptionFixture));
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, status: "past_due" });
    await processWebhookEvent(supabase, makeEvent("evt_12", "customer.subscription.updated", { ...subscriptionFixture, status: "past_due" }));
    expect(db.subscriptions).toHaveLength(1);
    expect(db.subscriptions[0].status).toBe("past_due");
  });

  /**
   * H/I — Stripe's explicit scheduled-cancellation timestamp (cancel_at),
   * a SEPARATE mechanism from cancel_at_period_end this app previously
   * never persisted. Live-verified root cause: Stripe Customer Portal
   * showed "Cancels Oct 25" while cancel_at_period_end was false and
   * cancel_at held the matching future timestamp.
   */
  it("H. persists a freshly-retrieved cancel_at (Stripe's explicit scheduled-cancellation timestamp) onto the subscriptions row", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at_period_end: false, cancel_at: 1792919792 });
    const result = await processWebhookEvent(supabase, makeEvent("evt_h0", "customer.subscription.updated", subscriptionFixture));

    expect(result.outcome).toBe("processed");
    expect(db.subscriptions[0].cancel_at_period_end).toBe(false);
    expect(db.subscriptions[0].cancel_at).toBe(new Date(1792919792 * 1000).toISOString());
  });

  it("H2. a later update WITHOUT cancel_at set clears the previously-stored value (removing scheduled cancellation is correctly reflected, not left stale)", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at: 1792919792 });
    await processWebhookEvent(supabase, makeEvent("evt_i0", "customer.subscription.updated", subscriptionFixture));
    expect(db.subscriptions[0].cancel_at).not.toBeNull();

    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at: null });
    await processWebhookEvent(supabase, makeEvent("evt_i1", "customer.subscription.updated", subscriptionFixture));
    expect(db.subscriptions[0].cancel_at).toBeNull();
  });

  it("I. removing a scheduled cancellation (cancel_at_period_end flips back to false, cancel_at cleared) is correctly synced from the fresh retrieve", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at_period_end: true, cancel_at: null });
    await processWebhookEvent(supabase, makeEvent("evt_i2", "customer.subscription.updated", subscriptionFixture));
    expect(db.subscriptions[0].cancel_at_period_end).toBe(true);

    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at_period_end: false, cancel_at: null });
    await processWebhookEvent(supabase, makeEvent("evt_i3", "customer.subscription.updated", subscriptionFixture));
    expect(db.subscriptions[0].cancel_at_period_end).toBe(false);
    expect(db.subscriptions[0].cancel_at).toBeNull();
  });

  it("F. a scheduled cancellation does not revoke entitlement — status stays 'active', which isEntitledStatus still treats as entitled", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, status: "active", cancel_at_period_end: false, cancel_at: 1792919792 });
    await processWebhookEvent(supabase, makeEvent("evt_f10", "customer.subscription.updated", subscriptionFixture));

    expect(db.subscriptions[0].status).toBe("active");
    const { isEntitledStatus } = await import("@/config/subscription");
    expect(isEntitledStatus(db.subscriptions[0].status as string)).toBe(true);
  });

  it("G. syncing a scheduled cancellation makes ZERO credit ledger calls — subscription sync and credit mutation are fully independent paths", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at_period_end: false, cancel_at: 1792919792 });
    await processWebhookEvent(supabase, makeEvent("evt_g0", "customer.subscription.updated", subscriptionFixture));

    expect(db.credit_ledger).toHaveLength(0);
    expect(db.credit_accounts).toHaveLength(0);
  });

  it("A. an OLDER event snapshot (cancel_at_period_end=false) is processed while Stripe's CURRENT state is cancel_at_period_end=true — the DB ends up true, from the retrieve, not the stale payload", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce(subscriptionFixture);
    await processWebhookEvent(supabase, makeEvent("evt_a0", "customer.subscription.created", subscriptionFixture));

    // The event's OWN payload still says false (stale), but Stripe's current truth (the retrieve) says true.
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at_period_end: true });
    const staleEvent = makeEvent("evt_a1", "customer.subscription.updated", { ...subscriptionFixture, cancel_at_period_end: false });
    const result = await processWebhookEvent(supabase, staleEvent);

    expect(result.outcome).toBe("processed");
    expect(db.subscriptions[0].cancel_at_period_end).toBe(true);
  });

  it("B. two subscription.updated events processed out of order both converge on the LATEST canonical Stripe state (exactly the live-verified bug)", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce(subscriptionFixture);
    await processWebhookEvent(supabase, makeEvent("evt_b0", "customer.subscription.created", subscriptionFixture));

    // First delivery processed: Stripe's current truth at that moment is already cancel_at_period_end=true.
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at_period_end: true });
    await processWebhookEvent(supabase, makeEvent("evt_b1", "customer.subscription.updated", { ...subscriptionFixture, cancel_at_period_end: true }));
    expect(db.subscriptions[0].cancel_at_period_end).toBe(true);

    // Second delivery processed LATER, but its OWN payload is the OLDER "false" snapshot
    // (Stripe does not guarantee order) — because we fetch fresh, this must NOT revert anything.
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at_period_end: true });
    await processWebhookEvent(supabase, makeEvent("evt_b2", "customer.subscription.updated", { ...subscriptionFixture, cancel_at_period_end: false }));
    expect(db.subscriptions[0].cancel_at_period_end).toBe(true); // still true — never reverted
  });

  it("C. a duplicate delivery of the SAME subscription.updated event id is skipped (safe/idempotent), never re-fetches or re-writes", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce(subscriptionFixture);
    await processWebhookEvent(supabase, makeEvent("evt_c0", "customer.subscription.created", subscriptionFixture));

    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, cancel_at_period_end: true });
    const event = makeEvent("evt_c1", "customer.subscription.updated", { ...subscriptionFixture, cancel_at_period_end: true });
    const first = await processWebhookEvent(supabase, event);
    expect(first.outcome).toBe("processed");
    const retrieveCallsAfterFirst = retrieveSubscription.mock.calls.length;

    const second = await processWebhookEvent(supabase, event); // exact same event id
    expect(second.outcome).toBe("skipped_duplicate");
    expect(retrieveSubscription.mock.calls.length).toBe(retrieveCallsAfterFirst); // no additional Stripe call
    expect(db.subscriptions[0].cancel_at_period_end).toBe(true);
  });

  it("D. created and updated delivered out of order still converge on the canonical current Stripe state", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);

    // "updated" is (unrealistically, but per the test's own requirement) delivered/processed BEFORE "created".
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, status: "active" });
    await processWebhookEvent(supabase, makeEvent("evt_d0", "customer.subscription.updated", { ...subscriptionFixture, status: "trialing" }));
    expect(db.subscriptions[0].status).toBe("active"); // from the retrieve, not the stale "trialing" payload

    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, status: "active" });
    await processWebhookEvent(supabase, makeEvent("evt_d1", "customer.subscription.created", subscriptionFixture));
    expect(db.subscriptions).toHaveLength(1); // still one row, upserted by user_id
    expect(db.subscriptions[0].status).toBe("active");
  });

  it("E. a customer.subscription.deleted event (subscription genuinely gone from Stripe) is followed by a STALE updated delivery — must NOT resurrect the subscription", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce(subscriptionFixture);
    await processWebhookEvent(supabase, makeEvent("evt_e0", "customer.subscription.created", subscriptionFixture));

    // The subscription has been permanently deleted — Stripe's retrieve now 404s with resource_missing.
    const resourceMissing = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "resource_missing",
      message: "No such subscription: 'sub_100'",
      statusCode: 404,
    } as never);
    retrieveSubscription.mockRejectedValueOnce(resourceMissing);
    const deletedResult = await processWebhookEvent(supabase, makeEvent("evt_e1", "customer.subscription.deleted", subscriptionFixture));
    expect(deletedResult.outcome).toBe("processed");
    expect(db.subscriptions[0].status).toBe("canceled"); // tombstoned

    // A STALE updated event for the same (now-deleted) subscription arrives later. Its own
    // retrieve ALSO 404s (the subscription really is gone) — must fail safely, never resurrect.
    retrieveSubscription.mockRejectedValueOnce(resourceMissing);
    const staleUpdate = await processWebhookEvent(supabase, makeEvent("evt_e2", "customer.subscription.updated", { ...subscriptionFixture, status: "active" }));
    expect(staleUpdate.outcome).toBe("failed"); // fails safely, does not write
    expect(db.subscriptions[0].status).toBe("canceled"); // still canceled — never resurrected to active
  });

  it("E2. when the deleted subscription IS still retrievable (the common Stripe case), it syncs status=canceled via the normal fresh-fetch path — no tombstone needed", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce(subscriptionFixture);
    await processWebhookEvent(supabase, makeEvent("evt_e3", "customer.subscription.created", subscriptionFixture));

    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, status: "canceled" });
    const result = await processWebhookEvent(supabase, makeEvent("evt_e4", "customer.subscription.deleted", { ...subscriptionFixture, status: "canceled" }));
    expect(result.outcome).toBe("processed");
    expect(db.subscriptions[0].status).toBe("canceled");
  });

  it("F. Stripe subscription retrieval fails with a non-resource_missing error — no stale snapshot is persisted, webhook fails safely for retry", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockRejectedValueOnce(new Error("simulated network failure"));
    const event = makeEvent("evt_f0", "customer.subscription.updated", { ...subscriptionFixture, status: "active" });
    const result = await processWebhookEvent(supabase, event);

    expect(result.outcome).toBe("failed");
    expect(result.error).toContain("simulated network failure");
    expect(db.subscriptions).toHaveLength(0); // nothing written — the payload's own snapshot was never trusted as a fallback
  });

  it("F2. a created event's retrieval fails with resource_missing (NOT a deleted event) — still fails safely, never tombstones or writes anything", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    const resourceMissing = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      code: "resource_missing",
      message: "No such subscription: 'sub_999'",
      statusCode: 404,
    } as never);
    retrieveSubscription.mockRejectedValueOnce(resourceMissing);
    const result = await processWebhookEvent(supabase, makeEvent("evt_f1", "customer.subscription.created", { ...subscriptionFixture, id: "sub_999" }));

    expect(result.outcome).toBe("failed"); // the resource_missing tombstone fallback is scoped to `deleted` events only
    expect(db.subscriptions).toHaveLength(0);
  });

  it("a subscription event with no metadata.user_id is safely ignored (never guesses ownership)", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce({ ...subscriptionFixture, metadata: {} });
    const event = makeEvent("evt_15", "customer.subscription.created", { ...subscriptionFixture, metadata: {} });
    const result = await processWebhookEvent(supabase, event);
    expect(result.outcome).toBe("processed"); // acknowledged, not a failure
    expect(db.subscriptions).toHaveLength(0);
  });

  it("checkout.session.completed syncs subscription state but grants ZERO credits", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValueOnce(subscriptionFixture);
    const session = { id: "cs_1", subscription: "sub_100", client_reference_id: "u1" };
    const result = await processWebhookEvent(supabase, makeEvent("evt_16", "checkout.session.completed", session));
    expect(result.outcome).toBe("processed");
    expect(db.subscriptions[0]).toMatchObject({ user_id: "u1", status: "active" });
    expect(db.credit_ledger).toHaveLength(0); // checkout completion alone never grants credits
  });
});

describe("processWebhookEvent — invoice.paid grants monthly credits exactly once", () => {
  beforeEach(() => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
  });

  it("grants the plan's configured monthly credits from SERVER config, keyed by invoice id", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValue({
      id: "sub_200",
      customer: "cus_200",
      status: "active",
      cancel_at_period_end: false,
      metadata: { user_id: "u1" },
      items: { data: [{ price: { id: "price_starter" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
    });
    const invoice = { id: "in_500", parent: { subscription_details: { subscription: "sub_200" } } };
    const result = await processWebhookEvent(supabase, makeEvent("evt_20", "invoice.paid", invoice));

    expect(result.outcome).toBe("processed");
    expect(db.credit_ledger).toHaveLength(1);
    expect(db.credit_ledger[0]).toMatchObject({ user_id: "u1", entry_type: "subscription_grant", idempotency_key: "stripe_invoice:in_500" });
    expect(db.credit_accounts[0].balance).toBe(150); // Starter plan's configured monthlyCredits
  });

  it("a retried/duplicate invoice.paid delivery grants ZERO additional credits", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValue({
      id: "sub_201",
      customer: "cus_201",
      status: "active",
      cancel_at_period_end: false,
      metadata: { user_id: "u1" },
      items: { data: [{ price: { id: "price_starter" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
    });
    const invoice = { id: "in_501", parent: { subscription_details: { subscription: "sub_201" } } };

    // First delivery.
    await processWebhookEvent(supabase, makeEvent("evt_21", "invoice.paid", invoice));
    // Stripe redelivers the SAME event id (network retry) — must be a total no-op.
    const secondDelivery = await processWebhookEvent(supabase, makeEvent("evt_21", "invoice.paid", invoice));

    expect(secondDelivery.outcome).toBe("skipped_duplicate");
    expect(db.credit_ledger).toHaveLength(1);
    expect(db.credit_accounts[0].balance).toBe(150); // not 300
  });

  it("out-of-order delivery (invoice.paid arrives BEFORE any subscription.* event) still grants correctly", async () => {
    const db = emptyDb(); // no pre-existing subscriptions row
    const supabase = makeFakeSupabase(db);
    retrieveSubscription.mockResolvedValue({
      id: "sub_202",
      customer: "cus_202",
      status: "active",
      cancel_at_period_end: false,
      metadata: { user_id: "u1" },
      items: { data: [{ price: { id: "price_starter" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
    });
    const invoice = { id: "in_502", parent: { subscription_details: { subscription: "sub_202" } } };
    const result = await processWebhookEvent(supabase, makeEvent("evt_22", "invoice.paid", invoice));
    expect(result.outcome).toBe("processed");
    expect(db.credit_accounts[0].balance).toBe(150);
    expect(db.subscriptions[0]).toMatchObject({ user_id: "u1", status: "active" }); // synced as a side effect, fetched fresh from Stripe
  });

  it("a non-subscription invoice (no parent.subscription_details) grants nothing and does not error", async () => {
    const db = emptyDb();
    const supabase = makeFakeSupabase(db);
    const invoice = { id: "in_503", parent: null };
    const result = await processWebhookEvent(supabase, makeEvent("evt_23", "invoice.paid", invoice));
    expect(result.outcome).toBe("processed");
    expect(db.credit_ledger).toHaveLength(0);
    expect(retrieveSubscription).not.toHaveBeenCalled();
  });

  it("invoice.payment_failed grants no credits and does not revoke already-granted credits", async () => {
    const db = emptyDb();
    db.credit_accounts.push({ user_id: "u1", balance: 100 });
    const supabase = makeFakeSupabase(db);
    const invoice = { id: "in_504", parent: { subscription_details: { subscription: "sub_203" } } };
    const result = await processWebhookEvent(supabase, makeEvent("evt_24", "invoice.payment_failed", invoice));
    expect(result.outcome).toBe("processed");
    expect(db.credit_accounts[0].balance).toBe(100); // untouched
    expect(db.credit_ledger).toHaveLength(0);
  });
});
