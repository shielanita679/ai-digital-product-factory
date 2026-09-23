/**
 * Centralized packaging safety limits — the single place these numbers
 * live, so PackageService/ZipBuilder never scatter a magic number through
 * the build pipeline. Deliberately generous for the kind of product this
 * app targets (sticker packs, planner printables, small graphic bundles —
 * PNG/SVG files typically well under a few MB each) while still bounding
 * how much a single package build can hold in server memory at once.
 *
 * These are defaults, not requirements from any provider — tune them here
 * if a future product category needs larger assets.
 */

/** Combined PNG + SVG + mockup + cover source files in one package. */
export const MAX_PACKAGE_SOURCE_ASSET_COUNT = 200;

/** Any single source asset (one PNG, one SVG, one mockup, the cover). */
export const MAX_PACKAGE_ASSET_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Sum of all source asset bytes read into memory for one build, before compression. */
export const MAX_PACKAGE_TOTAL_INPUT_BYTES = 300 * 1024 * 1024; // 300 MB

/** Final compressed ZIP buffer — a hard ceiling on what gets uploaded to Storage. */
export const MAX_PACKAGE_ZIP_BYTES = 350 * 1024 * 1024; // 350 MB

export function formatBytesForError(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} bytes`;
}
