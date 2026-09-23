import sharp from "sharp";

import type { MockupProvider, MockupInput, MockupResult, MockupTemplateType } from "@/lib/mockups/mockup-provider";
import { MOCKUP_TEMPLATE_VALUES } from "@/lib/mockups/mockup-provider";

/** Same avalanche-finalizer hash used by the other mock providers (mock-image-provider.ts, mock-vector-provider.ts) — duplicated locally rather than shared across provider families, keeping them independent. */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(hash, 31) + input.charCodeAt(i)) | 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"] as const;

const CANVAS = { width: 800, height: 800 } as const;

/**
 * Deterministic "product silhouette" SVG scenes — a flat, honest
 * placeholder shape for each template, never a photorealistic
 * composite. The scene is rasterized to a real PNG via sharp
 * (server-side, no network call, no AI generation) so the stored asset
 * is always a genuine, decodable image — never a stub that merely
 * claims to be one.
 */
function renderMockupScene(template: MockupTemplateType, title: string, accent: string, bgTint: string): string {
  const safeTitle = escapeXml(truncate(title, 40));
  const { width, height } = CANVAS;
  const cx = width / 2;

  const shapes: Record<MockupTemplateType, string> = {
    tshirt: `
      <path d="M ${cx - 220} 220 L ${cx - 120} 140 Q ${cx} 190 ${cx + 120} 140 L ${cx + 220} 220 L ${cx + 170} 300 L ${cx + 120} 270 L ${cx + 120} 620 L ${cx - 120} 620 L ${cx - 120} 270 L ${cx - 170} 300 Z" fill="${accent}" stroke="#111827" stroke-width="4" />
      <rect x="${cx - 80}" y="330" width="160" height="160" rx="8" fill="#ffffff" fill-opacity="0.85" />
    `,
    mug: `
      <rect x="${cx - 140}" y="220" width="280" height="320" rx="18" fill="${accent}" stroke="#111827" stroke-width="4" />
      <path d="M ${cx + 140} 280 Q ${cx + 260} 280 ${cx + 260} 380 Q ${cx + 260} 480 ${cx + 140} 480" fill="none" stroke="#111827" stroke-width="10" />
      <rect x="${cx - 100}" y="270" width="200" height="200" rx="8" fill="#ffffff" fill-opacity="0.85" />
    `,
    tote_bag: `
      <rect x="${cx - 180}" y="260" width="360" height="360" rx="12" fill="${accent}" stroke="#111827" stroke-width="4" />
      <path d="M ${cx - 90} 260 Q ${cx - 90} 160 ${cx} 160 Q ${cx + 90} 160 ${cx + 90} 260" fill="none" stroke="#111827" stroke-width="10" />
      <rect x="${cx - 110}" y="320" width="220" height="220" rx="8" fill="#ffffff" fill-opacity="0.85" />
    `,
    wall_art: `
      <rect x="${cx - 220}" y="140" width="440" height="560" rx="4" fill="#ffffff" stroke="#111827" stroke-width="10" />
      <rect x="${cx - 180}" y="180" width="360" height="480" fill="${bgTint}" />
      <rect x="${cx - 140}" y="220" width="280" height="280" rx="8" fill="${accent}" fill-opacity="0.85" />
    `,
    sticker_sheet: `
      <rect x="${cx - 260}" y="160" width="520" height="480" rx="16" fill="#ffffff" stroke="#111827" stroke-width="4" stroke-dasharray="10 8" />
      <circle cx="${cx - 130}" cy="300" r="70" fill="${accent}" />
      <rect x="${cx - 60}" y="230" width="140" height="140" rx="20" fill="${accent}" transform="rotate(8 ${cx + 10} 300)" />
      <polygon points="${cx + 90},240 ${cx + 190},240 ${cx + 220},330 ${cx + 140},390 ${cx + 60},330" fill="${accent}" />
      <circle cx="${cx - 130}" cy="480" r="60" fill="${bgTint}" />
      <rect x="${cx - 20}" y="420" width="120" height="120" rx="16" fill="${bgTint}" />
      <polygon points="${cx + 130},420 ${cx + 220},480 ${cx + 180},560 ${cx + 80},560 ${cx + 40},480" fill="${bgTint}" />
    `,
    digital_bundle_preview: `
      <rect x="${cx - 240}" y="180" width="480" height="440" rx="16" fill="#ffffff" stroke="#111827" stroke-width="4" />
      <rect x="${cx - 200}" y="220" width="180" height="180" rx="10" fill="${accent}" />
      <rect x="${cx + 20}" y="220" width="180" height="180" rx="10" fill="${bgTint}" />
      <rect x="${cx - 200}" y="420" width="400" height="140" rx="10" fill="${accent}" fill-opacity="0.35" />
    `,
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#f3f4f6" />
  ${shapes[template]}
  <rect x="0" y="${height - 90}" width="${width}" height="90" fill="rgba(17,17,17,0.82)" />
  <text x="24" y="${height - 52}" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#fff">${safeTitle}</text>
  <text x="24" y="${height - 24}" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="1" fill="#fbbf24">DEVELOPMENT MOCKUP — NOT PHOTOREALISTIC</text>
</svg>`;
}

export class MockMockupProvider implements MockupProvider {
  readonly name = "mock";
  readonly capabilities = {
    supportedTemplates: MOCKUP_TEMPLATE_VALUES,
    isDeterministic: true,
    usesSourceImagery: false,
  };

  async generate(input: MockupInput): Promise<MockupResult> {
    const seed = `${input.bundleId}:${input.designId}:${input.templateType}`;
    const hash = hashString(seed);
    const accent = PALETTE[hash % PALETTE.length];
    const bgTint = PALETTE[(hash >>> 3) % PALETTE.length];

    const svg = renderMockupScene(input.templateType, input.designTitle, accent, bgTint);

    let pngBuffer: Buffer;
    try {
      pngBuffer = await sharp(Buffer.from(svg, "utf8")).png().toBuffer();
    } catch (err) {
      return {
        ok: false,
        errorMessage: "The mock mockup provider could not rasterize the development preview.",
        metadata: { mock: true, rasterizeError: err instanceof Error ? err.message : String(err) },
      };
    }

    return {
      ok: true,
      bytes: pngBuffer,
      mimeType: "image/png",
      width: CANVAS.width,
      height: CANVAS.height,
      providerName: this.name,
      providerMockupId: `mock_mockup_${hashString(seed).toString(16)}`,
      metadata: {
        mock: true,
        note: "Development mockup preview — deterministic placeholder compositing, not a real product photo.",
        template: input.templateType,
      },
    };
  }
}
