import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { OpenAIImageProvider } from "@/lib/ai/providers/openai-image-provider";
import { normalizeDimensions, type ImageGenerationInput } from "@/lib/ai/image-provider";

// A real, valid 1x1 transparent PNG (IHDR width=1, height=1) so
// sniffImageMimeType + readPngDimensions both succeed against it.
const VALID_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function makeInput(overrides: Partial<ImageGenerationInput> = {}): ImageGenerationInput {
  return {
    variationIndex: 0,
    title: "Test Design",
    prompt: "A test prompt.",
    negativePrompt: "clutter",
    dimensions: normalizeDimensions("square"),
    transparentBackground: true,
    seed: "p:j:0",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OpenAIImageProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("declares its real capabilities honestly (no negative prompt, no seed)", () => {
    const provider = new OpenAIImageProvider("sk-test");
    expect(provider.capabilities.supportsNegativePrompt).toBe(false);
    expect(provider.capabilities.supportsSeed).toBe(false);
    expect(provider.capabilities.supportsTransparentBackground).toBe(true);
  });

  it("sends the expected request shape (model, prompt, size, background, output_format) with Bearer auth, never exposing the key elsewhere", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl: string | undefined;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({ data: [{ b64_json: VALID_PNG_B64 }] });
    }) as unknown as typeof fetch;

    const provider = new OpenAIImageProvider("sk-secret-value");
    await provider.generate(makeInput({ dimensions: normalizeDimensions("landscape"), transparentBackground: false }));

    expect(capturedUrl).toBe("https://api.openai.com/v1/images/generations");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-secret-value");

    const body = JSON.parse(capturedInit!.body as string);
    expect(body.model).toBe("gpt-image-1");
    expect(body.prompt).toBe("A test prompt.");
    expect(body.size).toBe("1536x1024"); // landscape
    expect(body.background).toBe("opaque"); // transparentBackground: false
    expect(body.output_format).toBe("png");
    expect(body.n).toBe(1);
    // Never sends a negative_prompt field — OpenAI's API has no such parameter.
    expect(body.negative_prompt).toBeUndefined();
  });

  it("maps orientation to the correct documented gpt-image-1 sizes", async () => {
    const sizes: string[] = [];
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      sizes.push(JSON.parse((init!.body as string)).size);
      return jsonResponse({ data: [{ b64_json: VALID_PNG_B64 }] });
    }) as unknown as typeof fetch;

    const provider = new OpenAIImageProvider("sk-test");
    await provider.generate(makeInput({ dimensions: normalizeDimensions("square") }));
    await provider.generate(makeInput({ dimensions: normalizeDimensions("portrait") }));
    await provider.generate(makeInput({ dimensions: normalizeDimensions("landscape") }));

    expect(sizes).toEqual(["1024x1024", "1024x1536", "1536x1024"]);
  });

  it("normalizes a successful response into source:'bytes' with real PNG dimensions read from the bytes", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ data: [{ b64_json: VALID_PNG_B64 }], usage: { total_tokens: 123 } })) as unknown as typeof fetch;

    const provider = new OpenAIImageProvider("sk-test");
    const result = await provider.generate(makeInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("bytes");
      if (result.source === "bytes") {
        expect(Buffer.isBuffer(result.imageBytes)).toBe(true);
        expect(result.imageBytes.length).toBeGreaterThan(0);
      }
      expect(result.mimeType).toBe("image/png");
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.providerGenerationId).toMatch(/^openai_/);
      expect(result.providerMetadata).toMatchObject({ model: "gpt-image-1", usage: { total_tokens: 123 } });
    }
  });

  it("fails safely (no stack trace, no raw body) on a 401 auth error", async () => {
    global.fetch = vi.fn(async () => new Response("unauthorized body with possibly sensitive detail", { status: 401 })) as unknown as typeof fetch;

    const provider = new OpenAIImageProvider("sk-bad");
    const result = await provider.generate(makeInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toContain("authentication failed");
      expect(result.errorMessage).not.toContain("sk-bad");
      expect(result.errorMessage).not.toContain("possibly sensitive");
    }
  });

  it("fails safely on a 429 rate limit", async () => {
    global.fetch = vi.fn(async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    const provider = new OpenAIImageProvider("sk-test");
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage.toLowerCase()).toContain("rate");
  });

  it("fails safely on a 500 provider error", async () => {
    global.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const provider = new OpenAIImageProvider("sk-test");
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage.toLowerCase()).toContain("unavailable");
  });

  it("fails safely on a malformed (non-JSON) response", async () => {
    global.fetch = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const provider = new OpenAIImageProvider("sk-test");
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(false);
  });

  it("fails safely when the response has no image data", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ data: [] })) as unknown as typeof fetch;
    const provider = new OpenAIImageProvider("sk-test");
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage).toContain("image data");
  });

  it("rejects a response whose bytes are not actually a PNG (MIME sniff failure)", async () => {
    const notAPng = Buffer.from("this is definitely not image bytes").toString("base64");
    global.fetch = vi.fn(async () => jsonResponse({ data: [{ b64_json: notAPng }] })) as unknown as typeof fetch;
    const provider = new OpenAIImageProvider("sk-test");
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage).toContain("unexpected image format");
  });

  it("rejects an empty image body", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ data: [{ b64_json: "" }] })) as unknown as typeof fetch;
    const provider = new OpenAIImageProvider("sk-test");
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(false);
  });

  it("handles a network failure/timeout without throwing", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const provider = new OpenAIImageProvider("sk-test");
    const result = await provider.generate(makeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage).toContain("unreachable");
  });
});
