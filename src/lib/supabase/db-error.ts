type PostgrestLikeError = { code?: string; message?: string } | null | undefined;

/**
 * The migration hasn't been applied yet. Two error shapes can mean this:
 * - "PGRST205": PostgREST's own code when a table is missing from its
 *   schema cache (what the JS client actually sees — Supabase requests go
 *   through PostgREST, not a raw Postgres connection).
 * - "42P01": the raw Postgres SQLSTATE for undefined_table, kept as a
 *   fallback in case a query ever reaches Postgres directly.
 */
export function isMissingTableError(error: PostgrestLikeError): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

export const MIGRATION_NOT_APPLIED_MESSAGE =
  "This feature needs a database migration that hasn't been applied to the live project yet. See supabase/README.md.";

export function friendlyDbErrorMessage(error: PostgrestLikeError, fallback: string): string {
  if (isMissingTableError(error)) {
    return MIGRATION_NOT_APPLIED_MESSAGE;
  }
  return error?.message || fallback;
}
