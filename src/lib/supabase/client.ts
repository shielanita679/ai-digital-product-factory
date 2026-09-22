import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/supabase";
import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Browser Supabase client. Create it lazily inside event handlers
 * (not at module scope) so pages still render if Supabase isn't
 * configured yet — the clear error only surfaces when auth is used.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
