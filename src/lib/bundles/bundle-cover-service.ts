import sharp from "sharp";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

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

const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"] as const;
const CANVAS = { width: 1200, height: 900 } as const;

export type BundleCoverInput = {
  /** Used to seed deterministic color/layout choices — the bundle's own id, not user-suppliable text. */
  bundleId: string;
  bundleName: string;
  itemCount: number;
  formats: { png: boolean; svg: boolean };
  /** A handful of design titles to show as "representative previews" — text labels only, never the actual raster/vector pixels (this generator never fetches or embeds source assets; see the module doc comment). */
  representativeDesignTitles: string[];
};

export type BundleCoverResult = {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
};

/**
 * Deterministic development bundle cover generator, kept behind this one
 * function so a future real generator (compositing actual asset
 * thumbnails, or calling a real image provider) can replace its
 * internals without callers (BundleService) changing at all. Never calls
 * OpenAI or any paid provider, never fetches the actual design pixels —
 * builds a flat, honest SVG scene (bundle name, item count, included
 * formats, up to a few representative TITLES as text tiles) and
 * rasterizes it to a real PNG via sharp, the same technique
 * MockMockupProvider uses.
 */
export async function generateBundleCoverPng(input: BundleCoverInput): Promise<BundleCoverResult> {
  const hash = hashString(input.bundleId);
  const accent = PALETTE[hash % PALETTE.length];
  const bgTint = PALETTE[(hash >>> 3) % PALETTE.length];

  const { width, height } = CANVAS;
  const safeName = escapeXml(truncate(input.bundleName, 42));

  const formatBadges: string[] = [];
  if (input.formats.png) formatBadges.push("PNG");
  if (input.formats.svg) formatBadges.push("SVG");
  const formatText = formatBadges.length > 0 ? formatBadges.join(" + ") : "No formats selected";

  const previewTitles = input.representativeDesignTitles.slice(0, 4);
  const tileWidth = 220;
  const tileGap = 24;
  const totalTilesWidth = previewTitles.length * tileWidth + Math.max(0, previewTitles.length - 1) * tileGap;
  const tilesStartX = (width - totalTilesWidth) / 2;
  const tileY = 420;
  const tileHeight = 220;

  const tiles = previewTitles
    .map((title, i) => {
      const x = tilesStartX + i * (tileWidth + tileGap);
      const fill = i % 2 === 0 ? accent : bgTint;
      const label = escapeXml(truncate(title, 20));
      return `
        <rect x="${x}" y="${tileY}" width="${tileWidth}" height="${tileHeight}" rx="14" fill="${fill}" fill-opacity="0.85" />
        <text x="${x + tileWidth / 2}" y="${tileY + tileHeight / 2}" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#ffffff" text-anchor="middle">${label}</text>
      `;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#111827" />
  <rect x="0" y="0" width="100%" height="260" fill="${accent}" fill-opacity="0.25" />
  <text x="60" y="130" font-family="system-ui, sans-serif" font-size="48" font-weight="800" fill="#ffffff">${safeName}</text>
  <text x="60" y="180" font-family="system-ui, sans-serif" font-size="22" fill="#d1d5db">${input.itemCount} design${input.itemCount === 1 ? "" : "s"} · ${escapeXml(formatText)}</text>
  ${tiles}
  <rect x="0" y="${height - 70}" width="100%" height="70" fill="rgba(0,0,0,0.55)" />
  <text x="60" y="${height - 28}" font-family="system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="1" fill="#fbbf24">DEVELOPMENT BUNDLE COVER — NOT A REAL PRODUCT PHOTO</text>
</svg>`;

  const bytes = await sharp(Buffer.from(svg, "utf8")).png().toBuffer();
  return { bytes, mimeType: "image/png", width, height };
}
