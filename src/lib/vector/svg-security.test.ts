import { describe, it, expect } from "vitest";
import { DOMParser } from "@xmldom/xmldom";

import { scanRawTextForXxe, scanDocumentForThreats } from "@/lib/vector/svg-security";

function parse(svg: string) {
  const parser = new DOMParser({ onError: () => {} });
  const doc = parser.parseFromString(svg, "image/svg+xml") as unknown as { documentElement: Parameters<typeof scanDocumentForThreats>[0] };
  return doc.documentElement;
}

describe("scanRawTextForXxe", () => {
  it("flags a DOCTYPE declaration", () => {
    expect(scanRawTextForXxe(`<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"></svg>`)?.code).toBe("xxe_doctype");
  });

  it("flags an ENTITY declaration (classic XXE shape)", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&xxe;</svg>`;
    expect(scanRawTextForXxe(xxe)?.code).toBe("xxe_doctype");
  });

  it("passes clean SVG text through", () => {
    expect(scanRawTextForXxe(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`)).toBeNull();
  });
});

describe("scanDocumentForThreats", () => {
  it("flags a <script> element", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
    expect(scanDocumentForThreats(root).map((t) => t.code)).toContain("unsafe_script");
  });

  it("flags onload/onclick event-handler attributes", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="alert(2)" width="1" height="1"/></svg>`);
    const codes = scanDocumentForThreats(root).map((t) => t.code);
    expect(codes.filter((c) => c === "unsafe_event_handler")).toHaveLength(2);
  });

  it("flags a javascript: URL in href", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/><use href="javascript:alert(1)"/></svg>`);
    expect(scanDocumentForThreats(root).map((t) => t.code)).toContain("unsafe_javascript_url");
  });

  it("flags a <foreignObject> element", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>hi</div></foreignObject></svg>`);
    expect(scanDocumentForThreats(root).map((t) => t.code)).toContain("unsafe_foreign_object");
  });

  it("flags an external (http) reference as unsafe_external_reference", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg#a"/></svg>`);
    expect(scanDocumentForThreats(root).map((t) => t.code)).toContain("unsafe_external_reference");
  });

  it("allows a same-document fragment reference", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><defs><rect id="a" width="1" height="1"/></defs><use href="#a"/></svg>`);
    expect(scanDocumentForThreats(root)).toEqual([]);
  });

  it("flags an <image> element as embedded_raster", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><image href="pic.png" width="1" height="1"/></svg>`);
    expect(scanDocumentForThreats(root).map((t) => t.code)).toContain("embedded_raster");
  });

  it("flags a base64 raster data: URI in an href as embedded_raster", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><use href="data:image/png;base64,iVBORw0KGgo="/></svg>`);
    expect(scanDocumentForThreats(root).map((t) => t.code)).toContain("embedded_raster");
  });

  it("flags dangerous CSS in a style attribute", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><rect style="behavior: url(evil.htc)" width="1" height="1"/></svg>`);
    expect(scanDocumentForThreats(root).map((t) => t.code)).toContain("unsafe_css");
  });

  it("flags an element outside the allowlist", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://evil.example"></iframe></svg>`);
    expect(scanDocumentForThreats(root).map((t) => t.code)).toContain("disallowed_element");
  });

  it("returns no threats for clean, allowlisted geometry", () => {
    const root = parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g><path d="M0 0 L10 10" fill="red"/><circle cx="5" cy="5" r="2"/></g></svg>`);
    expect(scanDocumentForThreats(root)).toEqual([]);
  });
});
