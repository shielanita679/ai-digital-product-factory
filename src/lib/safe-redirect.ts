/**
 * Guards against open-redirect attacks via user-controlled `?next=` params:
 * only same-origin, path-relative targets are honored.
 */
export function safeRedirectPath(path: string | undefined | null, fallback: string) {
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
