import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { SupabaseNotConfiguredError } from "@/lib/supabase/env";
import type { Profile } from "@/types/supabase";

export type AuthState =
  | { status: "not-configured" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: User; profile: Profile | null };

/**
 * Server-side auth + profile lookup as a single discriminated result, so
 * callers (protected layouts/pages) don't need try/catch boilerplate to
 * handle the "Supabase isn't configured yet" case.
 */
export async function getAuthState(): Promise<AuthState> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof SupabaseNotConfiguredError) {
      return { status: "not-configured" };
    }
    throw error;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return { status: "authenticated", user, profile: profile ?? null };
}
