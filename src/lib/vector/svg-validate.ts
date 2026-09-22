import { DOMParser } from "@xmldom/xmldom";

import {
  scanRawTextForXxe,
  scanDocumentForThreats,
  VECTOR_GEOMETRY_ELEMENTS,
  type SvgThreatCode,
} from "@/lib/vector/svg-security";

/**
 * Complexity ceilings a vector asset must stay under. SVG is text, so
 * these are generous relative to what a real (or the mock) vector result
 * should ever need — they exist to bound pathological/abusive input, not
 * to optimize normal output. Not enforced as aggressive minification;
 * see the Phase 7 report for why optimization is explicitly out of scope
 * this phase.
 */
export const SVG_LIMITS = {
  maxFileSizeBytes: 2 * 1024 * 1024, // 2 MB
  maxElementCount: 5000,
  maxShapeCount: 2000,
  maxSinglePathDataLength: 200_000,
  maxTotalPathDataLength: 1_000_000,
  maxNestingDepth: 60,
} as const;

export type SvgRejectionCode =
  | "too_large"
  | "malformed_xml"
  | "invalid_root"
  | "missing_dimensions"
  | "zero_geometry"
  | "too_complex"
  | SvgThreatCode;

export type SvgMetadata = {
  width: number | null;
  height: number | null;
  viewBox: { minX: number; minY: number; width: number; height: number } | null;
  pathCount: number;
  shapeCount: number;
  colorCount: number;
  fileSizeBytes: number;
  /** Always `false` for a successful result — a truthy raster-embedding signal is a hard rejection (embedded_raster), never a flag on a "completed" result. See svg-security.ts's design-decision comment. */
  hasEmbeddedRaster: false;
};

export type SvgValidationSuccess = {
  ok: true;
  /** The original, byte-for-byte validated SVG text — never re-serialized or partially modified. See svg-security.ts for why rejection (not stripping) is the design. */
  svg: string;
  metadata: SvgMetadata;
};

export type SvgValidationFailure = {
  ok: false;
  code: SvgRejectionCode;
  message: string;
};

export type SvgValidationResult = SvgValidationSuccess | SvgValidationFailure;

type MinimalElement = {
  nodeType: number;
  tagName?: string;
  localName?: string | null;
  getAttribute?: (name: string) => string | null;
  attributes: { length: number; [index: number]: { name: string; value: string } };
  childNodes: { length: number; [index: number]: MinimalElement };
};

const ELEMENT_NODE = 1;

function localTagName(el: MinimalElement): string {
  return (el.localName || el.tagName || "").toLowerCase();
}

function getAttr(el: MinimalElement, name: string): string | null {
  for (let i = 0; i < el.attributes.length; i++) {
    if (el.attributes[i].name.toLowerCase() === name.toLowerCase()) return el.attributes[i].value;
  }
  return null;
}

function parseNumericAttr(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*(-?[\d.]+)/.exec(value);
  if (!match) return null;
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) ? n : null;
}

function parseViewBox(value: string | null): SvgMetadata["viewBox"] {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number.parseFloat);
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return null;
  const [minX, minY, width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { minX, minY, width, height };
}

type Stats = {
  elementCount: number;
  maxDepth: number;
  pathCount: number;
  shapeCount: number;
  maxSinglePathDataLength: number;
  totalPathDataLength: number;
  colors: Set<string>;
};

const NON_COLOR_VALUES = new Set(["none", "transparent", "currentcolor", "inherit", ""]);

function collectStats(root: MinimalElement): Stats {
  const stats: Stats = {
    elementCount: 0,
    maxDepth: 0,
    pathCount: 0,
    shapeCount: 0,
    maxSinglePathDataLength: 0,
    totalPathDataLength: 0,
    colors: new Set(),
  };

  function walk(el: MinimalElement, depth: number) {
    if (el.nodeType !== ELEMENT_NODE) return;
    stats.elementCount += 1;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    const tag = localTagName(el);

    if (VECTOR_GEOMETRY_ELEMENTS.has(tag)) {
      stats.shapeCount += 1;
      if (tag === "path") {
        stats.pathCount += 1;
        const d = getAttr(el, "d") ?? "";
        stats.maxSinglePathDataLength = Math.max(stats.maxSinglePathDataLength, d.length);
        stats.totalPathDataLength += d.length;
      }
    }

    for (const attrName of ["fill", "stroke"]) {
      const value = getAttr(el, attrName);
      if (value) {
        const normalized = value.trim().toLowerCase();
        if (!NON_COLOR_VALUES.has(normalized) && !normalized.startsWith("url(")) {
          stats.colors.add(normalized);
        }
      }
    }

    for (let i = 0; i < el.childNodes.length; i++) {
      walk(el.childNodes[i], depth + 1);
    }
  }

  walk(root, 0);
  return stats;
}

/**
 * The single entry point the vectorize service calls on every provider's
 * raw SVG output before it is ever stored or served. Order is deliberate:
 * cheap, cataloged failures first (size, XXE, malformed XML) before the
 * more expensive full-tree walks, and every check runs to completion
 * (nothing short-circuits into a "probably fine" partial pass) — either
 * every check passes and the ORIGINAL text is returned unchanged, or a
 * specific, testable rejection code comes back. See svg-security.ts's
 * module doc comment for why rejection (not stripping) is the model.
 */
export function validateAndSanitizeSvg(svgText: string): SvgValidationResult {
  const fileSizeBytes = Buffer.byteLength(svgText, "utf8");
  if (fileSizeBytes > SVG_LIMITS.maxFileSizeBytes) {
    return { ok: false, code: "too_large", message: `SVG is ${fileSizeBytes} bytes, over the ${SVG_LIMITS.maxFileSizeBytes}-byte limit.` };
  }

  const xxe = scanRawTextForXxe(svgText);
  if (xxe) {
    return { ok: false, code: xxe.code, message: xxe.message };
  }

  let root: MinimalElement | null = null;
  try {
    const parser = new DOMParser({ onError: () => {} });
    const doc = parser.parseFromString(svgText, "image/svg+xml") as unknown as { documentElement: MinimalElement | null };
    root = doc.documentElement;
  } catch (err) {
    return { ok: false, code: "malformed_xml", message: err instanceof Error ? err.message : "The SVG is not well-formed XML." };
  }

  if (!root) {
    return { ok: false, code: "malformed_xml", message: "The SVG has no root element." };
  }
  if (localTagName(root) !== "svg") {
    return { ok: false, code: "invalid_root", message: `Root element is <${localTagName(root) || "unknown"}>, not <svg>.` };
  }

  const threats = scanDocumentForThreats(root);
  if (threats.length > 0) {
    const first = threats[0];
    const summary = threats.length > 1 ? `${first.message} (+${threats.length - 1} more issue${threats.length - 1 === 1 ? "" : "s"})` : first.message;
    return { ok: false, code: first.code, message: summary };
  }

  const stats = collectStats(root);

  if (
    stats.elementCount > SVG_LIMITS.maxElementCount ||
    stats.shapeCount > SVG_LIMITS.maxShapeCount ||
    stats.maxSinglePathDataLength > SVG_LIMITS.maxSinglePathDataLength ||
    stats.totalPathDataLength > SVG_LIMITS.maxTotalPathDataLength ||
    stats.maxDepth > SVG_LIMITS.maxNestingDepth
  ) {
    return {
      ok: false,
      code: "too_complex",
      message: `SVG exceeds complexity limits (elements=${stats.elementCount}, shapes=${stats.shapeCount}, maxPathData=${stats.maxSinglePathDataLength}, totalPathData=${stats.totalPathDataLength}, depth=${stats.maxDepth}).`,
    };
  }

  if (stats.shapeCount === 0) {
    return { ok: false, code: "zero_geometry", message: "SVG contains no recognized vector geometry (path/rect/circle/ellipse/polygon/polyline/line)." };
  }

  const viewBox = parseViewBox(getAttr(root, "viewBox"));
  const widthAttr = parseNumericAttr(getAttr(root, "width"));
  const heightAttr = parseNumericAttr(getAttr(root, "height"));
  const width = widthAttr ?? viewBox?.width ?? null;
  const height = heightAttr ?? viewBox?.height ?? null;

  if (!viewBox && (width === null || height === null)) {
    return { ok: false, code: "missing_dimensions", message: "SVG has no viewBox and no safely derivable width/height." };
  }

  return {
    ok: true,
    svg: svgText,
    metadata: {
      width,
      height,
      viewBox,
      pathCount: stats.pathCount,
      shapeCount: stats.shapeCount,
      colorCount: stats.colors.size,
      fileSizeBytes,
      hasEmbeddedRaster: false,
    },
  };
}
