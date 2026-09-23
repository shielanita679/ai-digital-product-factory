export class ZipPathSafetyError extends Error {
  constructor(readonly unsafePath: string) {
    super(`Refused to write an unsafe ZIP entry path: ${JSON.stringify(unsafePath)}`);
    this.name = "ZipPathSafetyError";
  }
}

/**
 * Defense in depth for ZIP entry paths (Phase 10 spec section 7/26). Every
 * path this codebase ever passes to ZipBuilder is already built entirely
 * from server-derived slugs/sequence numbers (filename-utils.ts) — never
 * from raw client input — so this should never actually reject a real
 * path. It exists anyway as a hard backstop: a bug that ever let an
 * unsanitized string reach here fails loudly instead of silently writing
 * a path-traversal entry into someone's downloaded ZIP.
 *
 * Rejects: empty segments, ".." anywhere, a leading "/" (absolute POSIX
 * path), a drive letter ("C:\\..."), backslashes (Windows separators —
 * this app only ever writes forward-slash entries), and any control
 * character. Returns the path unchanged when it's already safe.
 */
export function sanitizeZipEntryPath(path: string): string {
  if (!path || path.length === 0) throw new ZipPathSafetyError(path);
  if (path.includes("\\")) throw new ZipPathSafetyError(path);
  if (path.startsWith("/")) throw new ZipPathSafetyError(path);
  if (/^[a-zA-Z]:/.test(path)) throw new ZipPathSafetyError(path);
  if (/[\x00-\x1f]/.test(path)) throw new ZipPathSafetyError(path);

  const segments = path.split("/");
  for (const segment of segments) {
    if (segment.length === 0) throw new ZipPathSafetyError(path);
    if (segment === "." || segment === "..") throw new ZipPathSafetyError(path);
  }
  return path;
}
