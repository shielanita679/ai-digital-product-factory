import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/supabase";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Server Supabase client for Server Components, Server Functions, and
 * Route Handlers. Throws SupabaseNotConfiguredError if env vars are
 * missing — callers that need a friendly fallback should catch it.
 */
export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component render — the proxy already
          // refreshes the session cookie on the response, so this is safe to ignore.
        }
      },
    },
  });
}
