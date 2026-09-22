import { describe, it, expect, vi, afterEach } from "vitest";

import { fetchProviderImage, sniffImageMimeType, ProviderHttpError } from "@/lib/ai/provider-http";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const VALID_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const VALID_PNG_BYTES = Buffer.from(VALID_PNG_B64, "base64");

describe("sniffImageMimeType", () => {
  it("identifies a real PNG by magic bytes", () => {
    expect(sniffImageMimeType(VALID_PNG_BYTES)).toBe("image/png");
  });

  it("identifies a JPEG by magic bytes", () => {
    expect(sniffImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
  });

  it("returns null for bytes that aren't a recognized image format", () => {
    expect(sniffImageMimeType(Buffer.from("not an image"))).toBeNull();
  });

  it("does not trust a declared extension/MIME — only the actual bytes", () => {
    // Bytes that are plain text, regardless of what a caller might claim.
    expect(sniffImageMimeType(Buffer.from("<html>fake</html>"))).toBeNull();
  });
});

describe("fetchProviderImage", () => {
  it("downloads and returns valid PNG bytes with a correct MIME type", async () => {
    global.fetch = vi.fn(async () =>
      new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(VALID_PNG_BYTES.length) },
      }),
    ) as unknown as typeof fetch;

    const result = await fetchProviderImage("https://provider.example/image.png");
    expect(result.mimeType).toBe("image/png");
    expect(result.bytes.length).toBe(VALID_PNG_BYTES.length);
  });

  it("rejects a non-2xx response", async () => {
    global.fetch = vi.fn(async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchProviderImage("https://provider.example/missing.png")).rejects.toThrow(ProviderHttpError);
  });

  it("rejects a response with a disallowed content-type", async () => {
    global.fetch = vi.fn(async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    await expect(fetchProviderImage("https://provider.example/oops")).rejects.toThrow(ProviderHttpError);
  });

  it("rejects a response declaring a content-length over the size limit", async () => {
    global.fetch = vi.fn(async () =>
      new Response(VALID_PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(100 * 1024 * 1024) },
      }),
    ) as unknown as typeof fetch;
    await expect(fetchProviderImage("https://provider.example/huge.png", { maxBytes: 1024 })).rejects.toThrow(ProviderHttpError);
  });

  it("rejects a response whose actual body exceeds the size limit even without a content-length header", async () => {
    const bigBody = Buffer.alloc(2048, 1);
    global.fetch = vi.fn(async () =>
      new Response(bigBody, { status: 200, headers: { "content-type": "image/png" } }),
    ) as unknown as typeof fetch;
    await expect(fetchProviderImage("https://provider.example/big.png", { maxBytes: 1024 })).rejects.toThrow(ProviderHttpError);
  });

  it("rejects an empty body", async () => {
    global.fetch = vi.fn(async () => new Response(new Uint8Array(0), { status: 200, headers: { "content-type": "image/png" } })) as unknown as typeof fetch;
    await expect(fetchProviderImage("https://provider.example/empty.png")).rejects.toThrow(ProviderHttpError);
  });

  it("wraps a network failure in a caller-safe ProviderHttpError", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await expect(fetchProviderImage("https://provider.example/down.png")).rejects.toThrow(ProviderHttpError);
  });
});
