import JSZip from "jszip";

import { sanitizeZipEntryPath } from "@/lib/packages/zip-path-safety";
import { MAX_PACKAGE_ZIP_BYTES, formatBytesForError } from "@/config/packaging-limits";

export type ZipBinaryAsset = { path: string; bytes: Buffer };
export type ZipTextAsset = { path: string; content: string };

export type ZipBuildInput = {
  /** Single top-level folder every entry is written under (e.g. "cute-sticker-pack"). */
  rootFolder: string;
  binaryAssets: ZipBinaryAsset[];
  textAssets: ZipTextAsset[];
};

export type ZipBuildResult = {
  bytes: Buffer;
  entryCount: number;
};

export class ZipBuilderError extends Error {
  readonly code: "empty_package" | "zip_too_large";
  constructor(message: string, code: "empty_package" | "zip_too_large") {
    super(message);
    this.name = "ZipBuilderError";
    this.code = code;
  }
}

/**
 * Server-side only ZIP construction (Phase 10 spec section 7) — builds the
 * whole archive as an in-memory Buffer via jszip rather than a Node stream
 * pipeline. jszip is a small (no native deps), long-established, widely
 * used library; a fully in-memory buffer is the right fit here because
 * MAX_PACKAGE_TOTAL_INPUT_BYTES already bounds how much a single build can
 * hold in memory (see config/packaging-limits.ts), and the result is
 * uploaded to Supabase Storage as one Buffer either way — a stream-based
 * library (e.g. archiver) would add lifecycle complexity for no benefit in
 * a Server Action that already returns a single complete file.
 *
 * Every entry path is re-validated through sanitizeZipEntryPath()
 * immediately before being written, even though every caller already
 * builds paths exclusively from server-derived slugs (filename-utils.ts) —
 * see that function's own doc comment for why this is deliberate defense
 * in depth, not defensive-for-its-own-sake duplication.
 */
export async function buildZipBuffer(input: ZipBuildInput): Promise<ZipBuildResult> {
  const root = sanitizeZipEntryPath(input.rootFolder);
  if (input.binaryAssets.length === 0 && input.textAssets.length === 0) {
    throw new ZipBuilderError("Refused to build an empty package — no assets to include.", "empty_package");
  }

  const zip = new JSZip();
  let entryCount = 0;

  for (const asset of input.binaryAssets) {
    const fullPath = sanitizeZipEntryPath(`${root}/${asset.path}`);
    zip.file(fullPath, asset.bytes);
    entryCount += 1;
  }
  for (const asset of input.textAssets) {
    const fullPath = sanitizeZipEntryPath(`${root}/${asset.path}`);
    // Normalize to \n line endings for deterministic, cross-platform-readable text files.
    zip.file(fullPath, asset.content.replace(/\r\n/g, "\n"));
    entryCount += 1;
  }

  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  if (bytes.byteLength > MAX_PACKAGE_ZIP_BYTES) {
    throw new ZipBuilderError(
      `The generated package (${formatBytesForError(bytes.byteLength)}) exceeds the ${formatBytesForError(MAX_PACKAGE_ZIP_BYTES)} package size limit.`,
      "zip_too_large",
    );
  }

  return { bytes, entryCount };
}
