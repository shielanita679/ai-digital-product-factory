/**
 * The manifest is persisted to product_packages.manifest (jsonb) for
 * debugging and future Phase 10/11/12 operations (spec section 8) — it is
 * NOT written as a file inside the ZIP itself; the spec's own example ZIP
 * tree (section 1) has no manifest.json entry, and a manifest embedded in
 * the very archive it describes would need to describe its own resulting
 * byte size/checksum before those exist. Deliberately excludes anything
 * sensitive: no secret keys, no signed URLs, no provider tokens — every
 * field here is either already public-ish product metadata or a plain
 * structural fact about the build (paths/types/sizes).
 */
export type ManifestFileEntry = {
  path: string;
  type: "png" | "svg" | "mockup" | "cover" | "listing" | "license" | "readme";
  sourceDesignId?: string;
  byteSize: number;
};

export type PackageManifest = {
  packageVersion: number;
  bundleId: string;
  bundleName: string;
  marketplace: string;
  createdAt: string;
  files: ManifestFileEntry[];
};

export function buildPackageManifest(input: {
  version: number;
  bundleId: string;
  bundleName: string;
  marketplace: string;
  files: ManifestFileEntry[];
}): PackageManifest {
  return {
    packageVersion: input.version,
    bundleId: input.bundleId,
    bundleName: input.bundleName,
    marketplace: input.marketplace,
    createdAt: new Date().toISOString(),
    files: input.files,
  };
}
