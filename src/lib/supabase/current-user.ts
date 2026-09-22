import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

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

/**
 * For Server Actions and pages that need a guaranteed-authenticated user
 * (never trusting a client-supplied id). Redirects to /login if there's no
 * session — Server Actions can't rely on the proxy or a parent layout for
 * this, since they run independently of the render tree that invoked them.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}
