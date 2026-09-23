import type { MockupTemplateType } from "@/lib/mockups/mockup-provider";

/**
 * Deterministic, filesystem-safe slugging shared by every filename this
 * module produces — never echoes raw user text into a ZIP entry path
 * unfiltered. Collapses anything outside `[a-z0-9-]` to a single hyphen,
 * trims leading/trailing hyphens, and falls back to `"file"` if nothing
 * survives (e.g. a title that's pure emoji/punctuation).
 */
export function slugify(input: string, maxLength = 60): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "file";
}

/** The ZIP's root folder name and the downloadable .zip filename's base — same slug, one source of truth. */
export function bundleSlug(bundleName: string): string {
  return slugify(bundleName, 60);
}

export function packageFileName(bundleName: string, marketplace: string): string {
  const base = bundleSlug(bundleName);
  const suffix = marketplace === "generic" ? "" : `-${slugify(marketplace, 20)}`;
  return `${base}${suffix}.zip`;
}

/**
 * Zero-padded sequence prefix guarantees uniqueness on its own (two
 * designs with the identical title still get "01-cat.png"/"02-cat.png"),
 * so no separate collision-detection pass is needed for PNG/SVG names —
 * the same base name is deliberately reused for a design's PNG and SVG
 * (section 13 of the Phase 10 spec: "same design's PNG/SVG should
 * preferably share the same logical base filename").
 */
export function designBaseFilename(index: number, totalCount: number, designTitle: string): string {
  const width = Math.max(2, String(totalCount).length);
  const seq = String(index + 1).padStart(width, "0");
  return `${seq}-${slugify(designTitle, 40)}`;
}

/**
 * Stable, human-readable mockup filenames (section 14) — not a mechanical
 * kebab-case of the DB's template_type (e.g. "wall_art" ships as the more
 * descriptive "wall-art-poster.png", matching the Phase 10 spec's own
 * example tree exactly), so this is an explicit map rather than a
 * transform.
 */
const MOCKUP_STABLE_FILENAME: Record<MockupTemplateType, string> = {
  tshirt: "tshirt",
  mug: "mug",
  tote_bag: "tote-bag",
  wall_art: "wall-art-poster",
  sticker_sheet: "sticker-sheet",
  digital_bundle_preview: "digital-bundle-preview",
};

export function mockupStableName(templateType: MockupTemplateType): string {
  return MOCKUP_STABLE_FILENAME[templateType] ?? slugify(templateType, 40);
}

/**
 * A bundle can have the same template mockup for MULTIPLE designs (one
 * "tshirt" mockup per design, all within the same bundle), which would
 * otherwise collide on the same stable filename. Resolved deterministically:
 * the design's own numbered prefix (matching its PNG/SVG numbering) is
 * added ONLY when more than one design contributes that template type —
 * a bundle with just one t-shirt mockup still gets the clean "tshirt.png"
 * name from the spec's example.
 */
export function buildMockupFilenames(
  mockups: Array<{ templateType: MockupTemplateType; designIndex: number }>,
): string[] {
  const countByTemplate = new Map<MockupTemplateType, number>();
  for (const m of mockups) {
    countByTemplate.set(m.templateType, (countByTemplate.get(m.templateType) ?? 0) + 1);
  }
  const totalDesigns = mockups.length > 0 ? Math.max(...mockups.map((m) => m.designIndex)) + 1 : 0;
  const width = Math.max(2, String(totalDesigns).length);

  return mockups.map((m) => {
    const stable = mockupStableName(m.templateType);
    const needsPrefix = (countByTemplate.get(m.templateType) ?? 0) > 1;
    if (!needsPrefix) return `${stable}.png`;
    const seq = String(m.designIndex + 1).padStart(width, "0");
    return `${seq}-${stable}.png`;
  });
}
