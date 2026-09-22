type PostgrestLikeError = { code?: string; message?: string } | null | undefined;

/**
 * A pending migration hasn't been applied to the live project yet. Four
 * error shapes can mean this, discovered by probing the live project
 * directly (Supabase requests go through PostgREST, not a raw Postgres
 * connection, so the JS client mostly sees PostgREST's own codes — but a
 * raw Postgres code can still surface depending on the query path):
 * - "PGRST205": PostgREST — table missing from its schema cache.
 * - "42P01": raw Postgres SQLSTATE — undefined_table.
 * - "PGRST204": PostgREST — column missing from its schema cache
 *   (seen on insert/update payloads referencing a not-yet-added column).
 * - "42703": raw Postgres SQLSTATE — undefined_column (seen when a select
 *   names a specific not-yet-added column).
 */
const MIGRATION_NOT_APPLIED_CODES = new Set(["PGRST205", "42P01", "PGRST204", "42703"]);

export function isMigrationNotAppliedError(error: PostgrestLikeError): boolean {
  return !!error?.code && MIGRATION_NOT_APPLIED_CODES.has(error.code);
}

export const MIGRATION_NOT_APPLIED_MESSAGE =
  "This feature needs a database migration that hasn't been applied to the live project yet. See supabase/README.md.";

export function friendlyDbErrorMessage(error: PostgrestLikeError, fallback: string): string {
  if (isMigrationNotAppliedError(error)) {
    return MIGRATION_NOT_APPLIED_MESSAGE;
  }
  return error?.message || fallback;
}
