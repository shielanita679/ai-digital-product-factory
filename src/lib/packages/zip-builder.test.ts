import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { buildZipBuffer, ZipBuilderError } from "@/lib/packages/zip-builder";
import { ZipPathSafetyError } from "@/lib/packages/zip-path-safety";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("buildZipBuffer — actually opens and inspects the resulting archive (Phase 10 spec section 23)", () => {
  it("writes binary and text assets under the given root folder with correct bytes", async () => {
    const result = await buildZipBuffer({
      rootFolder: "my-bundle",
      binaryAssets: [{ path: "PNG/01-cat.png", bytes: PNG_MAGIC }],
      textAssets: [{ path: "listing.txt", content: "TITLE\n-----\n\nCat Stickers" }],
    });

    expect(result.entryCount).toBe(2);

    const zip = await JSZip.loadAsync(result.bytes);
    // jszip implicitly creates directory entries for nested paths (e.g.
    // "my-bundle/", "my-bundle/PNG/") — filtered out here since only real
    // FILE entries are the thing under test; directories aren't user
    // content and every real caller only ever writes files.
    const names = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    expect(names).toEqual(["my-bundle/PNG/01-cat.png", "my-bundle/listing.txt"]);

    const pngBytes = await zip.file("my-bundle/PNG/01-cat.png")!.async("nodebuffer");
    expect(pngBytes.equals(PNG_MAGIC)).toBe(true);
    // PNG magic bytes present in the actual extracted file, not just "a buffer exists".
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);
    expect(pngBytes[2]).toBe(0x4e);
    expect(pngBytes[3]).toBe(0x47);

    const listingText = await zip.file("my-bundle/listing.txt")!.async("string");
    expect(listingText).toBe("TITLE\n-----\n\nCat Stickers");
  });

  it("writes real SVG text content that round-trips exactly", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const result = await buildZipBuffer({
      rootFolder: "bundle",
      binaryAssets: [{ path: "SVG/01-cat.svg", bytes: Buffer.from(svg, "utf8") }],
      textAssets: [],
    });
    const zip = await JSZip.loadAsync(result.bytes);
    const extracted = await zip.file("bundle/SVG/01-cat.svg")!.async("string");
    expect(extracted).toBe(svg);
    expect(extracted.trimStart().startsWith("<svg")).toBe(true);
  });

  it("normalizes CRLF to LF in text assets deterministically", async () => {
    const result = await buildZipBuffer({
      rootFolder: "bundle",
      binaryAssets: [],
      textAssets: [{ path: "README.txt", content: "line one\r\nline two\r\n" }],
    });
    const zip = await JSZip.loadAsync(result.bytes);
    const text = await zip.file("bundle/README.txt")!.async("string");
    expect(text).toBe("line one\nline two\n");
  });

  it("produces no duplicate entry paths and no unexpected files for a multi-asset build", async () => {
    const result = await buildZipBuffer({
      rootFolder: "bundle",
      binaryAssets: [
        { path: "PNG/01-cat.png", bytes: PNG_MAGIC },
        { path: "SVG/01-cat.svg", bytes: Buffer.from("<svg/>") },
        { path: "MOCKUPS/tshirt.png", bytes: PNG_MAGIC },
        { path: "PREVIEW/bundle-cover.png", bytes: PNG_MAGIC },
      ],
      textAssets: [
        { path: "listing.txt", content: "x" },
        { path: "license.txt", content: "y" },
        { path: "README.txt", content: "z" },
      ],
    });
    const zip = await JSZip.loadAsync(result.bytes);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(names).toHaveLength(7);
    expect(new Set(names).size).toBe(7); // no duplicates
    expect(names.every((n) => n.startsWith("bundle/"))).toBe(true);
  });

  it("rejects building an empty package", async () => {
    await expect(buildZipBuffer({ rootFolder: "bundle", binaryAssets: [], textAssets: [] })).rejects.toThrow(ZipBuilderError);
  });

  it("propagates path-traversal rejection from sanitizeZipEntryPath even though every real caller already builds safe paths", async () => {
    await expect(
      buildZipBuffer({ rootFolder: "bundle", binaryAssets: [{ path: "../../evil.png", bytes: PNG_MAGIC }], textAssets: [] }),
    ).rejects.toThrow(ZipPathSafetyError);
  });

  it("rejects an unsafe root folder name", async () => {
    await expect(buildZipBuffer({ rootFolder: "../evil", binaryAssets: [{ path: "a.png", bytes: PNG_MAGIC }], textAssets: [] })).rejects.toThrow(ZipPathSafetyError);
  });

  it("enforces MAX_PACKAGE_ZIP_BYTES on the final compressed buffer", async () => {
    vi.resetModules();
    vi.doMock("@/config/packaging-limits", async () => {
      const actual = await vi.importActual<typeof import("@/config/packaging-limits")>("@/config/packaging-limits");
      return { ...actual, MAX_PACKAGE_ZIP_BYTES: 10 };
    });
    const { buildZipBuffer: buildWithTinyLimit, ZipBuilderError: ScopedError } = await import("@/lib/packages/zip-builder");
    await expect(
      buildWithTinyLimit({ rootFolder: "bundle", binaryAssets: [{ path: "a.png", bytes: Buffer.alloc(1000, 1) }], textAssets: [] }),
    ).rejects.toThrow(ScopedError);
    vi.doUnmock("@/config/packaging-limits");
    vi.resetModules();
  });

  it("extracting the ZIP into a temp directory never escapes it — actually extracts to disk and checks the filesystem", async () => {
    const result = await buildZipBuffer({
      rootFolder: "bundle",
      binaryAssets: [{ path: "PNG/01-cat.png", bytes: PNG_MAGIC }],
      textAssets: [{ path: "README.txt", content: "hello" }],
    });
    const zip = await JSZip.loadAsync(result.bytes);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zip-extract-test-"));
    try {
      for (const [entryName, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const destPath = path.join(tmpDir, entryName);
        // The exact check a real extractor should perform: the resolved
        // destination must stay inside tmpDir.
        expect(destPath.startsWith(tmpDir + path.sep)).toBe(true);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, await entry.async("nodebuffer"));
      }
      const extractedPng = await fs.readFile(path.join(tmpDir, "bundle", "PNG", "01-cat.png"));
      expect(extractedPng.equals(PNG_MAGIC)).toBe(true);
      const extractedReadme = await fs.readFile(path.join(tmpDir, "bundle", "README.txt"), "utf8");
      expect(extractedReadme).toBe("hello");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
