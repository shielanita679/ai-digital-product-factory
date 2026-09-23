import { describe, it, expect } from "vitest";

import { buildPackageManifest } from "@/lib/packages/package-manifest-builder";

describe("buildPackageManifest", () => {
  it("captures version/bundle/marketplace/files structurally", () => {
    const manifest = buildPackageManifest({
      version: 2,
      bundleId: "bundle-1",
      bundleName: "Cute Sticker Pack",
      marketplace: "etsy",
      files: [{ path: "PNG/01-cat.png", type: "png", sourceDesignId: "design-1", byteSize: 1234 }],
    });
    expect(manifest.packageVersion).toBe(2);
    expect(manifest.bundleId).toBe("bundle-1");
    expect(manifest.bundleName).toBe("Cute Sticker Pack");
    expect(manifest.marketplace).toBe("etsy");
    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0]).toMatchObject({ path: "PNG/01-cat.png", type: "png", sourceDesignId: "design-1", byteSize: 1234 });
    expect(new Date(manifest.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("never includes secrets, tokens, or signed URLs — only the declared structural fields exist on the object", () => {
    const manifest = buildPackageManifest({ version: 1, bundleId: "b", bundleName: "B", marketplace: "generic", files: [] });
    const keys = Object.keys(manifest).sort();
    expect(keys).toEqual(["bundleId", "bundleName", "createdAt", "files", "marketplace", "packageVersion"]);
  });
});
