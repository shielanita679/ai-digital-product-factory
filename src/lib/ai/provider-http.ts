/**
 * Shared, provider-agnostic HTTP helpers for talking to an image-generation
 * vendor's API. Not a generic fetch endpoint — `fetchProviderImage` only
 * ever downloads a URL a *provider's own response* handed back to a
 * server-side provider adapter; the browser can never reach this, and no
 * caller passes it a user-supplied URL.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
/** Generous enough for a single production image (PNG at up to ~2K), small enough to reject something absurd. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly safeMessage: string,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads and validates an image a provider's own response pointed at
 * (a temporary remote URL, for a provider that doesn't return inline
 * bytes). Enforces a timeout, a maximum response size (aborting the
 * download early rather than buffering something huge), and a real MIME
 * check against the actual bytes' declared content-type — never trusts a
 * provider blindly. Throws `ProviderHttpError` with a caller-safe message
 * on any failure; never leaks response bodies or headers.
 */
export async function fetchProviderImage(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<{ bytes: Buffer; mimeType: string }> {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;

  let response: Response;
  try {
    response = await fetchWithTimeout(url, { method: "GET" }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch {
    throw new ProviderHttpError(
      `Timed out or failed fetching provider image from ${url}`,
      "Could not download the generated image from the provider.",
    );
  }

  if (!response.ok) {
    throw new ProviderHttpError(
      `Provider image fetch returned HTTP ${response.status}`,
      "The image provider's download link was invalid or expired.",
    );
  }

  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    throw new ProviderHttpError(
      `Provider image declared content-length ${declaredLength} exceeds ${maxBytes}`,
      "The generated image was larger than allowed.",
    );
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
    throw new ProviderHttpError(
      `Provider image had unexpected content-type "${contentType}"`,
      "The image provider returned an unexpected file type.",
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) {
    throw new ProviderHttpError(
      `Provider image body ${arrayBuffer.byteLength} bytes exceeds ${maxBytes}`,
      "The generated image was larger than allowed.",
    );
  }
  if (arrayBuffer.byteLength === 0) {
    throw new ProviderHttpError("Provider image body was empty", "The image provider returned an empty image.");
  }

  return { bytes: Buffer.from(arrayBuffer), mimeType: contentType };
}

/** Magic-byte sniffing so we never trust a declared MIME type alone for bytes we already have in hand (e.g. base64-decoded). */
export function sniffImageMimeType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export { MAX_IMAGE_BYTES, ALLOWED_IMAGE_MIME_TYPES };
