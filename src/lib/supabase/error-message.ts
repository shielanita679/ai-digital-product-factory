import { SupabaseNotConfiguredError } from "@/lib/supabase/env";

/** Supabase's AuthError#message is already user-facing; this just adds a safe fallback. */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof SupabaseNotConfiguredError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
