import type {
  VectorProvider,
  VectorizationInput,
  VectorizationResult,
} from "@/lib/vector/vector-provider";

/** Same avalanche-finalizer hash as MockImageProvider's — duplicated locally (a handful of lines) rather than importing across provider families, to keep the image and vector provider modules independent of each other. */
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

/** A tiny deterministic PRNG seeded from the hash, so multiple values can be drawn from one seed without re-hashing strings repeatedly. */
function makeRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

const PALETTE = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#d97706", // amber
  "#7c3aed", // violet
  "#0891b2", // cyan
] as const;

/** A smooth closed "blob" path built from cubic bezier segments around a circle — genuine, non-trivial vector geometry, not a traced raster. */
function buildBlobPath(cx: number, cy: number, baseRadius: number, rng: () => number, points = 8): string {
  const angles: number[] = [];
  for (let i = 0; i < points; i++) angles.push((i / points) * Math.PI * 2);

  const radii = angles.map(() => baseRadius * (0.72 + rng() * 0.36));
  const coords = angles.map((angle, i) => [cx + Math.cos(angle) * radii[i], cy + Math.sin(angle) * radii[i]] as const);

  const kappa = 0.5523;
  let d = `M ${coords[0][0].toFixed(2)} ${coords[0][1].toFixed(2)} `;
  for (let i = 0; i < points; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[(i + 1) % points];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const c1x = x0 + dx * kappa;
    const c1y = y0 + dy * kappa;
    const c2x = x1 - dx * kappa;
    const c2y = y1 - dy * kappa;
    d += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x1.toFixed(2)} ${y1.toFixed(2)} `;
  }
  return `${d}Z`;
}

/**
 * Builds a deterministic, self-contained SVG made of real vector shapes
 * (a bezier "blob" path, a circle, a rect, and a polygon) whose position,
 * size, and color all vary with `seed`. It never references, embeds, or
 * traces the source raster — it is a development pipeline fixture, not an
 * accurate vectorization. That honesty is stated both in the returned
 * `providerMetadata` and baked into the artwork itself as a text label
 * (mirroring how MockImageProvider labels its own raster preview), so it
 * can't be mistaken for real output even if metadata is stripped
 * downstream.
 */
function renderMockVectorSvg(input: { seed: string; aspectRatio: number }): string {
  const hash = hashString(input.seed);
  const rng = makeRng(hash);

  // Keep the source's rough aspect ratio (a purely numeric hint — never
  // the pixels themselves) without ever embedding the raster.
  const height = 512;
  const width = Math.max(128, Math.min(1024, Math.round(height * input.aspectRatio)));
  const cx = width / 2;
  const cy = height / 2;

  // Unsigned right shift (`>>>`), not `>>`: `hash` can exceed 2^31 (it's
  // forced unsigned via `>>> 0` in hashString), and a signed `>>` on such
  // a value first reinterprets it as a negative 32-bit int, producing a
  // negative shift result and therefore a negative `% PALETTE.length`
  // remainder (JS modulo keeps the dividend's sign) — silently indexing
  // PALETTE with a negative number, which returns `undefined`, which
  // then serialized into the SVG as a literal `fill="undefined"`. Found
  // via a live Phase 7 vectorization run.
  const blobColor = PALETTE[hash % PALETTE.length];
  const circleColor = PALETTE[(hash >>> 3) % PALETTE.length];
  const rectColor = PALETTE[(hash >>> 6) % PALETTE.length];
  const polyColor = PALETTE[(hash >>> 9) % PALETTE.length];

  const blobRadius = Math.min(width, height) * 0.24;
  const blobPath = buildBlobPath(cx, cy, blobRadius, rng);

  const circleR = Math.min(width, height) * 0.08;
  const circleCx = cx + Math.min(width, height) * 0.32;
  const circleCy = cy - Math.min(width, height) * 0.28;

  const rectSize = Math.min(width, height) * 0.14;
  const rectX = cx - Math.min(width, height) * 0.38 - rectSize / 2;
  const rectY = cy + Math.min(width, height) * 0.26 - rectSize / 2;

  const triR = Math.min(width, height) * 0.1;
  const triCx = cx - Math.min(width, height) * 0.3;
  const triCy = cy - Math.min(width, height) * 0.3;
  const triPoints = [0, 1, 2]
    .map((i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      return `${(triCx + triR * Math.cos(angle)).toFixed(2)},${(triCy + triR * Math.sin(angle)).toFixed(2)}`;
    })
    .join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <path d="${blobPath}" fill="${blobColor}" fill-opacity="0.92" />
  <circle cx="${circleCx.toFixed(2)}" cy="${circleCy.toFixed(2)}" r="${circleR.toFixed(2)}" fill="${circleColor}" />
  <rect x="${rectX.toFixed(2)}" y="${rectY.toFixed(2)}" width="${rectSize.toFixed(2)}" height="${rectSize.toFixed(2)}" rx="${(rectSize * 0.18).toFixed(2)}" fill="${rectColor}" />
  <polygon points="${triPoints}" fill="${polyColor}" />
  <text x="${width / 2}" y="${height - 14}" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="1" fill="#6b7280" text-anchor="middle">DEVELOPMENT VECTOR PREVIEW — NOT A REAL VECTORIZATION</text>
</svg>`;
}

export class MockVectorProvider implements VectorProvider {
  readonly name = "mock";
  readonly capabilities = {
    supportsColorLimit: false,
    supportsSimplifySetting: false,
    isDeterministic: true,
  };

  async vectorize(input: VectorizationInput): Promise<VectorizationResult> {
    const aspectRatio = input.raster.width > 0 && input.raster.height > 0 ? input.raster.width / input.raster.height : 1;
    const seed = `${input.designId}:${input.raster.width}x${input.raster.height}`;

    const svg = renderMockVectorSvg({ seed, aspectRatio });

    return {
      ok: true,
      svg,
      providerName: this.name,
      providerVectorizationId: `mock_vec_${hashString(seed).toString(16)}`,
      settingsApplied: {
        maxColors: PALETTE.length,
        simplify: "medium",
      },
      providerMetadata: {
        mock: true,
        note: "Development vector preview — deterministic placeholder geometry, not a real vectorization of the source image.",
      },
    };
  }
}
