import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level test for the webhook HTTP handler itself: request parsing
 * (raw body read, header extraction) and status-code mapping. The actual
 * signature-verification and event-processing LOGIC is covered exhaustively
 * in webhook-service.test.ts with zero Stripe network calls — here both are
 * mocked so this file only proves the route wires them correctly and maps
 * each outcome to the right HTTP status, per the route's own doc comment:
 * 400 for a bad/missing signature or misconfiguration, 200 for anything
 * handled or safely no-op'd, 500 only for a genuine processing failure
 * (which asks Stripe to retry).
 */

class WebhookServiceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}
class StripeNotConfiguredError extends Error {}
class StripeLiveModeRejectedError extends Error {}

const verifyWebhookSignature = vi.fn();
const processWebhookEvent = vi.fn();
vi.mock("@/lib/stripe/webhook-service", () => ({
  verifyWebhookSignature,
  processWebhookEvent,
  WebhookServiceError,
}));
vi.mock("@/lib/stripe/stripe-env", () => ({
  StripeNotConfiguredError,
  StripeLiveModeRejectedError,
}));

const createServiceRoleClient = vi.fn(() => ({ __serviceRole: true }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient }));

const { POST } = await import("@/app/api/stripe/webhook/route");

function makeRequest(body: string, signature: string | null) {
  const headers = new Headers();
  if (signature !== null) headers.set("stripe-signature", signature);
  return new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", body, headers });
}

beforeEach(() => {
  verifyWebhookSignature.mockReset();
  processWebhookEvent.mockReset();
  createServiceRoleClient.mockClear();
});

describe("POST /api/stripe/webhook", () => {
  it("reads the raw body text and passes it, plus the stripe-signature header, to verifyWebhookSignature", async () => {
    verifyWebhookSignature.mockReturnValue({ id: "evt_1", type: "invoice.paid" });
    processWebhookEvent.mockResolvedValue({ outcome: "processed" });

    await POST(makeRequest('{"raw":"body"}', "t=1,v1=abc"));

    expect(verifyWebhookSignature).toHaveBeenCalledWith('{"raw":"body"}', "t=1,v1=abc");
  });

  it("returns 400 when the stripe-signature header is missing (never calls processWebhookEvent)", async () => {
    verifyWebhookSignature.mockImplementation(() => {
      throw new WebhookServiceError("Missing stripe-signature header.", "missing_signature");
    });

    const response = await POST(makeRequest("{}", null));

    expect(response.status).toBe(400);
    expect(processWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when the signature is invalid", async () => {
    verifyWebhookSignature.mockImplementation(() => {
      throw new WebhookServiceError("Invalid signature.", "invalid_signature");
    });

    const response = await POST(makeRequest("{}", "t=1,v1=bad"));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Invalid signature.");
  });

  it("returns 400 with a safe message when Stripe is not configured — never leaks configuration detail", async () => {
    verifyWebhookSignature.mockImplementation(() => {
      throw new StripeNotConfiguredError("STRIPE_SECRET_KEY is not set.");
    });

    const response = await POST(makeRequest("{}", "t=1,v1=x"));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Billing is not configured.");
    expect(processWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when live-mode credentials are rejected by the test-mode guard", async () => {
    verifyWebhookSignature.mockImplementation(() => {
      throw new StripeLiveModeRejectedError("Live-mode Stripe key rejected.");
    });

    const response = await POST(makeRequest("{}", "t=1,v1=x"));

    expect(response.status).toBe(400);
    expect(processWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns 200 with the outcome for a fully processed event", async () => {
    verifyWebhookSignature.mockReturnValue({ id: "evt_1", type: "invoice.paid" });
    processWebhookEvent.mockResolvedValue({ outcome: "processed" });

    const response = await POST(makeRequest("{}", "t=1,v1=x"));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ received: true, outcome: "processed" });
  });

  it("returns 200 for a duplicate event — tells Stripe to stop retrying", async () => {
    verifyWebhookSignature.mockReturnValue({ id: "evt_1", type: "invoice.paid" });
    processWebhookEvent.mockResolvedValue({ outcome: "duplicate" });

    const response = await POST(makeRequest("{}", "t=1,v1=x"));

    expect(response.status).toBe(200);
  });

  it("returns 200 for an unknown/ignored event type — safely no-op'd", async () => {
    verifyWebhookSignature.mockReturnValue({ id: "evt_1", type: "some.unhandled.event" });
    processWebhookEvent.mockResolvedValue({ outcome: "ignored" });

    const response = await POST(makeRequest("{}", "t=1,v1=x"));

    expect(response.status).toBe(200);
  });

  it("returns 500 when processing genuinely fails after a valid signature — asks Stripe to retry", async () => {
    verifyWebhookSignature.mockReturnValue({ id: "evt_1", type: "invoice.paid" });
    processWebhookEvent.mockResolvedValue({ outcome: "failed", error: "database unavailable" });

    const response = await POST(makeRequest("{}", "t=1,v1=x"));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("database unavailable");
  });

  it("uses the service-role client (never a session/anon client) to process events", async () => {
    verifyWebhookSignature.mockReturnValue({ id: "evt_1", type: "invoice.paid" });
    processWebhookEvent.mockResolvedValue({ outcome: "processed" });

    await POST(makeRequest("{}", "t=1,v1=x"));

    expect(createServiceRoleClient).toHaveBeenCalled();
    expect(processWebhookEvent).toHaveBeenCalledWith({ __serviceRole: true }, { id: "evt_1", type: "invoice.paid" });
  });
});
