/**
 * listing.txt is built ONLY from the seller's already-saved listing row
 * (product_listings) — no AI call, no regeneration, matching the Phase 10
 * spec section 10 exactly. Deliberately plain, human-readable text (not
 * JSON/markdown): this file is meant to be opened by the seller after
 * download, not parsed by code.
 */
export function buildListingText(listing: {
  title: string | null;
  description: string | null;
  tags: string[];
  seoKeywords: string[];
  includedFiles: string[];
  materials: string[];
}): string {
  const sections: string[] = [];

  sections.push(`TITLE\n-----\n\n${listing.title ?? "(untitled)"}`);
  sections.push(`DESCRIPTION\n-----------\n\n${listing.description ?? "(no description)"}`);
  sections.push(`TAGS\n----\n\n${listing.tags.length > 0 ? listing.tags.join(", ") : "(none)"}`);
  sections.push(`KEYWORDS\n--------\n\n${listing.seoKeywords.length > 0 ? listing.seoKeywords.join(", ") : "(none)"}`);

  const productDetailLines = [
    listing.includedFiles.length > 0 ? `Formats included: ${listing.includedFiles.join(", ")}` : null,
    listing.materials.length > 0 ? `Materials: ${listing.materials.join(", ")}` : null,
  ].filter((l): l is string => !!l);
  sections.push(`PRODUCT DETAILS\n---------------\n\n${productDetailLines.length > 0 ? productDetailLines.join("\n") : "(none)"}`);

  return sections.join("\n\n");
}

/**
 * license.txt is the seller's exact saved license_text, byte-for-byte —
 * never regenerated during packaging (Phase 10 spec section 11). The only
 * transformation applied anywhere in the pipeline is the uniform \r\n ->
 * \n normalization every text asset gets in ZipBuilder, not here.
 */
export function buildLicenseText(licenseText: string): string {
  return licenseText;
}
