import type {
  ImageGenerationProvider,
  ImageGenerationInput,
  ImageGenerationResult,
  ProviderCapabilities,
} from "@/lib/ai/image-provider";
import { fetchWithTimeout, sniffImageMimeType, MAX_IMAGE_BYTES } from "@/lib/ai/provider-http";

const OPENAI_IMAGES_ENDPOINT = "https://api.openai.com/v1/images/generations";
const OPENAI_MODEL = "gpt-image-1";
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * OpenAI's Images API (gpt-image-1). Chosen for Phase 6 because it maps
 * cleanly onto the existing provider abstraction with no invented
 * details: server-side Bearer-token auth, a single JSON POST, a
 * documented fixed set of `size` values, native `background: "transparent"`
 * support (a real, honest answer to the app's transparent-background
 * intent — most competitors require post-processing background removal),
 * and — critically for a server-side flow with no browser involved —
 * `gpt-image-1` returns the image as base64 JSON (`b64_json`) rather than
 * a temporary remote URL, so there is no separate fetch-and-validate step
 * for *this* provider (see `provider-http.ts` for the shared helper a
 * future URL-returning provider would use instead).
 *
 * gpt-image-1 has no negative-prompt parameter and no seed parameter —
 * `capabilities` reports both as unsupported rather than pretending.
 */
export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = "openai";
  readonly capabilities: ProviderCapabilities = {
    supportsNegativePrompt: false,
    supportsTransparentBackground: true,
    supportsAspectRatio: true,
    supportsSeed: false,
    supportsMultipleOutputs: true,
  };

  constructor(private readonly apiKey: string) {}

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const size = mapOrientationToSize(input.dimensions.orientation);

    let response: Response;
    try {
      response = await fetchWithTimeout(
        OPENAI_IMAGES_ENDPOINT,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            prompt: input.prompt,
            n: 1,
            size,
            quality: "medium",
            background: input.transparentBackground ? "transparent" : "opaque",
            output_format: "png",
          }),
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch {
      return { ok: false, errorMessage: "The image provider timed out or was unreachable." };
    }

    if (!response.ok) {
      return { ok: false, errorMessage: safeErrorMessageForStatus(response.status), providerMetadata: { httpStatus: response.status } };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, errorMessage: "The image provider returned a malformed response." };
    }

    const parsed = parseOpenAIResponse(json);
    if (!parsed) {
      return { ok: false, errorMessage: "The image provider response did not include image data." };
    }

    let imageBytes: Buffer;
    try {
      imageBytes = Buffer.from(parsed.b64Json, "base64");
    } catch {
      return { ok: false, errorMessage: "The image provider returned undecodable image data." };
    }

    if (imageBytes.length === 0) {
      return { ok: false, errorMessage: "The image provider returned an empty image." };
    }
    if (imageBytes.length > MAX_IMAGE_BYTES) {
      return { ok: false, errorMessage: "The generated image was larger than allowed." };
    }

    const sniffedMimeType = sniffImageMimeType(imageBytes);
    if (sniffedMimeType !== "image/png") {
      return { ok: false, errorMessage: "The image provider returned an unexpected image format." };
    }

    const dimensions = readPngDimensions(imageBytes) ?? { width: input.dimensions.width, height: input.dimensions.height };

    return {
      ok: true,
      source: "bytes",
      imageBytes,
      mimeType: "image/png",
      width: dimensions.width,
      height: dimensions.height,
      // gpt-image-1 either honors `background: "transparent"` or (rarely,
      // for prompts it judges unsuitable) silently falls back to opaque —
      // we can't fully verify from the response alone, so we report what
      // we asked for and note it's provider-reported, not independently
      // re-verified. A future iteration could sniff the PNG's alpha
      // channel to confirm this rather than trust the request intent.
      transparentBackgroundApplied: input.transparentBackground,
      providerGenerationId: parsed.generationId,
      providerMetadata: {
        model: OPENAI_MODEL,
        size,
        ...(parsed.usage ? { usage: parsed.usage } : {}),
      },
    };
  }
}

function mapOrientationToSize(orientation: ImageGenerationInput["dimensions"]["orientation"]): string {
  switch (orientation) {
    case "portrait":
      return "1024x1536";
    case "landscape":
      return "1536x1024";
    case "square":
    default:
      return "1024x1024";
  }
}

function safeErrorMessageForStatus(status: number): string {
  if (status === 401 || status === 403) return "The image provider rejected the request (authentication failed).";
  if (status === 429) return "The image provider is rate-limiting requests right now. Please try again shortly.";
  if (status >= 500) return "The image provider is temporarily unavailable.";
  return "The image provider returned an error.";
}

type ParsedOpenAIResponse = {
  b64Json: string;
  generationId: string;
  usage?: Record<string, unknown>;
};

/** Narrow, defensive parsing — never trusts the shape blindly, never throws on unexpected JSON. */
function parseOpenAIResponse(json: unknown): ParsedOpenAIResponse | null {
  if (!json || typeof json !== "object") return null;
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const b64Json = (first as { b64_json?: unknown }).b64_json;
  if (typeof b64Json !== "string" || b64Json.length === 0) return null;

  const usage = (json as { usage?: unknown }).usage;

  return {
    b64Json,
    // gpt-image-1 doesn't return a per-image id — derive a stable one from
    // the response itself so we still have something to store/display.
    generationId: `openai_${hashBase64Prefix(b64Json)}`,
    usage: usage && typeof usage === "object" ? (usage as Record<string, unknown>) : undefined,
  };
}

function hashBase64Prefix(b64: string): string {
  let hash = 0;
  const sample = b64.slice(0, 64);
  for (let i = 0; i < sample.length; i++) {
    hash = (Math.imul(hash, 31) + sample.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/** Reads width/height straight from the PNG IHDR chunk — never trusts the requested size, only the actual bytes. */
function readPngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  // PNG signature (8 bytes) + IHDR length/type (8 bytes) precede the IHDR
  // payload; width/height are the first 8 bytes of that payload.
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}
