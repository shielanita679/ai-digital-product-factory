import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { requireUser } from "@/lib/supabase/current-user";
import type { Database } from "@/types/supabase";

export class AdminRequiredError extends Error {
  constructor() {
    super("This action requires admin access.");
    this.name = "AdminRequiredError";
  }
}

async function fetchRole(supabase: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return data?.role ?? null;
}

/**
 * Server-side admin gate. Re-reads `profiles.role` from the database on
 * EVERY call via the caller's own session-scoped client — never cached,
 * never trusted from a client-supplied flag or a prior request. Hiding an
 * "Admin" nav link is cosmetic only; this is the actual authorization
 * boundary, matching the Phase 12 spec's explicit "hiding navigation links
 * is NOT sufficient authorization."
 *
 * For pages/layouts under /admin — redirects non-admins to /dashboard
 * (never renders admin content, even briefly).
 */
export async function requireAdmin(): Promise<{ supabase: SupabaseClient<Database>; user: User }> {
  const { supabase, user } = await requireUser();
  const role = await fetchRole(supabase, user.id);
  if (role !== "admin") {
    redirect("/dashboard");
  }
  return { supabase, user };
}

/**
 * For admin-only Server Actions, where a redirect isn't the right shape —
 * throws AdminRequiredError instead so the caller's existing try/catch →
 * `{ok:false,error}` union pattern (same shape as every other Server
 * Action in this codebase) can surface a friendly rejection.
 */
export async function assertAdmin(): Promise<{ supabase: SupabaseClient<Database>; user: User }> {
  const { supabase, user } = await requireUser();
  const role = await fetchRole(supabase, user.id);
  if (role !== "admin") {
    throw new AdminRequiredError();
  }
  return { supabase, user };
}
