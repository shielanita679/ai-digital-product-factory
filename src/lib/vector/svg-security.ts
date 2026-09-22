/**
 * SVG threat detection — the "sanitize" half of Phase 7's validate +
 * sanitize pipeline (svg-validate.ts is the other half).
 *
 * Design decision: REJECT, never silently strip. A stripping sanitizer
 * (walk the tree, delete the bad parts, serialize what's left, store
 * that) has to be proven correct for every possible bypass, and a single
 * missed case quietly re-introduces the exact vulnerability class it was
 * meant to close. Rejecting the whole asset the moment anything unsafe is
 * found is far easier to reason about and test: either the SVG passed
 * through completely clean, or the vectorization failed outright with a
 * dedicated error code. Nothing partially-modified is ever stored or
 * served, so there's no "did the stripping actually remove everything"
 * question to get wrong. The mock provider never produces any of this —
 * these checks exist for whatever produces the SVG text, present or
 * future, that the app does not fully control.
 */

export type SvgThreatCode =
  | "xxe_doctype"
  | "embedded_raster"
  | "unsafe_script"
  | "unsafe_event_handler"
  | "unsafe_javascript_url"
  | "unsafe_foreign_object"
  | "unsafe_external_reference"
  | "unsafe_css"
  | "disallowed_element";

export type SvgThreat = {
  code: SvgThreatCode;
  message: string;
  element?: string;
};

/**
 * Elements a validated SVG may contain. Deliberately an ALLOWLIST, not a
 * blocklist — anything not named here is rejected, so a threat category
 * nobody thought to blocklist (a future SVG feature, a parser quirk)
 * fails closed instead of silently passing through.
 */
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
  "use",
  "defs",
  "title",
  "desc",
  "text",
  "tspan",
]);

/** The recognized-vector-geometry subset of ALLOWED_ELEMENTS — see section 8/12 of the Phase 7 spec. */
export const VECTOR_GEOMETRY_ELEMENTS = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline", "line"]);

/** Elements whose presence means "this is raster content wearing an SVG wrapper", not a real vector result. */
const RASTER_EMBEDDING_ELEMENTS = new Set(["image", "img"]);

const EVENT_HANDLER_ATTR = /^on/i;
const JAVASCRIPT_URL = /^\s*javascript:/i;
const DANGEROUS_CSS = /(expression\s*\(|-moz-binding|behavior\s*:|@import|url\s*\()/i;
const DATA_IMAGE_URI = /^\s*data:image\//i;

/** Raw-text pre-parse scan — catches XXE/DOCTYPE before we ever hand the string to an XML parser. Legitimate SVG output (mock, or any future real provider) never needs a DOCTYPE or entity declaration. */
export function scanRawTextForXxe(svgText: string): SvgThreat | null {
  if (/<!DOCTYPE/i.test(svgText) || /<!ENTITY/i.test(svgText)) {
    return {
      code: "xxe_doctype",
      message: "The SVG contains a DOCTYPE or ENTITY declaration, which is never needed by legitimate vector output and is a classic XXE attack vector.",
    };
  }
  return null;
}

type MinimalElement = {
  nodeType: number;
  tagName?: string;
  localName?: string | null;
  attributes: { length: number; [index: number]: { name: string; value: string } };
  childNodes: { length: number; [index: number]: MinimalElement };
};

const ELEMENT_NODE = 1;

function localTagName(el: MinimalElement): string {
  return (el.localName || el.tagName || "").toLowerCase();
}

/** Walks the parsed DOM depth-first and returns every violation found (not just the first), so a rejection can report a complete, useful reason. */
export function scanDocumentForThreats(root: MinimalElement): SvgThreat[] {
  const threats: SvgThreat[] = [];

  function walk(el: MinimalElement) {
    if (el.nodeType !== ELEMENT_NODE) return;
    const tag = localTagName(el);

    if (RASTER_EMBEDDING_ELEMENTS.has(tag)) {
      threats.push({
        code: "embedded_raster",
        message: `Found a <${tag}> element — the SVG embeds raster content instead of containing genuine vector geometry.`,
        element: tag,
      });
    } else if (tag === "script") {
      threats.push({ code: "unsafe_script", message: "Found a <script> element.", element: tag });
    } else if (tag === "foreignobject") {
      threats.push({ code: "unsafe_foreign_object", message: "Found a <foreignObject> element.", element: tag });
    } else if (!ALLOWED_ELEMENTS.has(tag)) {
      threats.push({ code: "disallowed_element", message: `Found a disallowed element <${tag}>.`, element: tag });
    }

    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      const name = attr.name.toLowerCase();
      const value = attr.value ?? "";

      if (EVENT_HANDLER_ATTR.test(name)) {
        threats.push({ code: "unsafe_event_handler", message: `Found an event-handler attribute "${attr.name}" on <${tag}>.`, element: tag });
        continue;
      }

      if (name === "href" || name === "xlink:href") {
        if (JAVASCRIPT_URL.test(value)) {
          threats.push({ code: "unsafe_javascript_url", message: `Found a javascript: URL in "${attr.name}" on <${tag}>.`, element: tag });
        } else if (DATA_IMAGE_URI.test(value)) {
          threats.push({ code: "embedded_raster", message: `Found a raster data: URI in "${attr.name}" on <${tag}>.`, element: tag });
        } else if (!value.startsWith("#")) {
          // Only same-document fragment references (e.g. <use href="#shape">)
          // are allowed — anything else is an external dependency, which
          // both breaks the "portable, no external deps" Cricut-friendly
          // goal and is a potential SSRF/tracking-pixel vector.
          threats.push({ code: "unsafe_external_reference", message: `Found a non-local reference in "${attr.name}" on <${tag}>: must start with "#".`, element: tag });
        }
        continue;
      }

      if (JAVASCRIPT_URL.test(value)) {
        threats.push({ code: "unsafe_javascript_url", message: `Found a javascript: URL in "${attr.name}" on <${tag}>.`, element: tag });
        continue;
      }

      if (name === "style" && DANGEROUS_CSS.test(value)) {
        threats.push({ code: "unsafe_css", message: `Found unsafe CSS in a style attribute on <${tag}>.`, element: tag });
      }
    }

    for (let i = 0; i < el.childNodes.length; i++) {
      walk(el.childNodes[i]);
    }
  }

  walk(root);
  return threats;
}
