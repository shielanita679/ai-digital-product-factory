import { describe, it, expect } from "vitest";

import { validateAndSanitizeSvg, SVG_LIMITS } from "@/lib/vector/svg-validate";

const VALID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10 L90 10 L90 90 Z" fill="#ff0000"/><circle cx="50" cy="50" r="10" fill="#00ff00"/></svg>`;

describe("validateAndSanitizeSvg", () => {
  it("accepts a valid SVG and returns the original text unchanged, plus accurate metadata", () => {
    const result = validateAndSanitizeSvg(VALID_SVG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toBe(VALID_SVG);
    expect(result.metadata.viewBox).toEqual({ minX: 0, minY: 0, width: 100, height: 100 });
    expect(result.metadata.pathCount).toBe(1);
    expect(result.metadata.shapeCount).toBe(2);
    expect(result.metadata.colorCount).toBe(2);
    expect(result.metadata.hasEmbeddedRaster).toBe(false);
    expect(result.metadata.fileSizeBytes).toBe(Buffer.byteLength(VALID_SVG, "utf8"));
  });

  it("derives width/height from a viewBox when explicit width/height attributes are absent", () => {
    const result = validateAndSanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="10" height="10"/></svg>`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.width).toBe(200);
    expect(result.metadata.height).toBe(150);
  });

  it("rejects malformed XML", () => {
    const result = validateAndSanitizeSvg(`<svg><rect width="1"></svg`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("malformed_xml");
  });

  it("rejects a document whose root element isn't <svg>", () => {
    const result = validateAndSanitizeSvg(`<html xmlns="http://www.w3.org/1999/xhtml"><body>hi</body></html>`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_root");
  });

  it("rejects a DOCTYPE/XXE attempt", () => {
    const result = validateAndSanitizeSvg(
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&xxe;</svg>`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("xxe_doctype");
  });

  it("rejects a <script> element", () => {
    const result = validateAndSanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/><script>alert(1)</script></svg>`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unsafe_script");
  });

  it("rejects an onload/onclick event handler", () => {
    const result = validateAndSanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><rect width="1" height="1"/></svg>`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unsafe_event_handler");
  });

  it("rejects a javascript: URL", () => {
    const result = validateAndSanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/><use href="javascript:alert(1)"/></svg>`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unsafe_javascript_url");
  });

  it("rejects a <foreignObject> element", () => {
    const result = validateAndSanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject></svg>`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unsafe_foreign_object");
  });

  it("rejects an external (non-fragment) reference", () => {
    const result = validateAndSanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/><use href="https://evil.example/sprite.svg#x"/></svg>`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unsafe_external_reference");
  });

  it("rejects an embedded raster <image> element — this is the core Phase 7 anti-fake-vectorization rule", () => {
    const result = validateAndSanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/></svg>`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("embedded_raster");
  });

  it("rejects a raster data: URI referenced from a non-<image> element too", () => {
    const result = validateAndSanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/><use href="data:image/jpeg;base64,/9j/4AAQ"/></svg>`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("embedded_raster");
  });

  it("rejects an SVG with zero recognized vector geometry", () => {
    const result = validateAndSanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Empty</title></svg>`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("zero_geometry");
  });

  it("rejects an oversized SVG", () => {
    const bigPath = "M0 0 " + "L1 1 ".repeat(Math.ceil(SVG_LIMITS.maxFileSizeBytes / 5) + 1000);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="${bigPath}"/></svg>`;
    const result = validateAndSanitizeSvg(svg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("too_large");
  });

  it("rejects an SVG that exceeds the shape-count complexity limit", () => {
    const rects = Array.from({ length: SVG_LIMITS.maxShapeCount + 1 }, (_, i) => `<rect x="${i}" y="0" width="1" height="1"/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${rects}</svg>`;
    const result = validateAndSanitizeSvg(svg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("too_complex");
  });

  it("rejects an SVG with an oversized single path's `d` attribute", () => {
    const hugeD = "M0 0 " + "L1 1 ".repeat(SVG_LIMITS.maxSinglePathDataLength);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="${hugeD}"/></svg>`;
    const result = validateAndSanitizeSvg(svg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["too_complex", "too_large"]).toContain(result.code);
  });

  it("rejects an SVG with neither a viewBox nor width/height", () => {
    const result = validateAndSanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("missing_dimensions");
  });

  it("rejects a disallowed element (e.g. iframe) even without any other obviously dangerous attribute", () => {
    const result = validateAndSanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/><iframe src="https://evil.example"></iframe></svg>`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("disallowed_element");
  });
});
