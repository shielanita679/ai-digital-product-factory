import { describe, it, expect } from "vitest";

import { sanitizeZipEntryPath, ZipPathSafetyError } from "@/lib/packages/zip-path-safety";

describe("sanitizeZipEntryPath — Phase 10 spec section 26 traversal/unsafe-content guard", () => {
  it("accepts a normal, already-safe nested path unchanged", () => {
    expect(sanitizeZipEntryPath("my-bundle/PNG/01-cat.png")).toBe("my-bundle/PNG/01-cat.png");
  });

  const unsafePaths = [
    "../../evil",
    "../file",
    "/foo",
    "/foo/bar",
    "C:\\evil",
    "C:/evil",
    "name/../../evil",
    "a/../b",
    "..",
    "a/..",
    "a//b", // empty segment
    "a/\u0000b", // control character
  ];

  for (const unsafe of unsafePaths) {
    it(`rejects ${JSON.stringify(unsafe)}`, () => {
      expect(() => sanitizeZipEntryPath(unsafe)).toThrow(ZipPathSafetyError);
    });
  }

  it("rejects backslash separators outright (Windows-style), even without '..'", () => {
    expect(() => sanitizeZipEntryPath("folder\\file.png")).toThrow(ZipPathSafetyError);
  });

  it("rejects an empty path", () => {
    expect(() => sanitizeZipEntryPath("")).toThrow(ZipPathSafetyError);
  });
});
