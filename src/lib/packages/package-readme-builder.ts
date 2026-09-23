export type ReadmeCounts = {
  pngCount: number;
  svgCount: number;
  mockupCount: number;
  hasCover: boolean;
  hasListing: boolean;
  hasLicense: boolean;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Deterministic from factual package contents ONLY (Phase 10 spec section
 * 12) — no AI call, and never claims a file type exists unless its count
 * is actually greater than zero / its flag is actually true. Two builds of
 * the exact same package contents always produce byte-identical README
 * text.
 */
export function buildReadmeText(counts: ReadmeCounts): string {
  const lines: string[] = [];
  if (counts.pngCount > 0) lines.push(`- ${plural(counts.pngCount, "PNG file")}`);
  if (counts.svgCount > 0) lines.push(`- ${plural(counts.svgCount, "SVG file")}`);
  if (counts.mockupCount > 0) lines.push(`- ${plural(counts.mockupCount, "mockup")}`);
  if (counts.hasCover) lines.push(`- bundle preview`);
  if (counts.hasListing) lines.push(`- listing information`);
  if (counts.hasLicense) lines.push(`- license`);

  const contentsBlock = lines.length > 0 ? lines.join("\n") : "- (no files included)";

  return (
    `Thank you for creating this digital product with AI Digital Product Factory.\n\n` +
    `This package contains:\n${contentsBlock}\n\n` +
    `Important:\n` +
    `This is a digital product package. Review the included license (if any) before reselling or ` +
    `redistributing these files, and check listing.txt for the marketplace-ready title, description, ` +
    `tags, and keywords you saved for this product.`
  );
}
