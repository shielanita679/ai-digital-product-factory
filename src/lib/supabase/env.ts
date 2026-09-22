export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.example), then restart the dev server.",
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

type SupabaseEnv = {
  url: string;
  anonKey: string;
};

function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

/** Throws a clear, catchable error when Supabase credentials are missing. */
export function getSupabaseEnv(): SupabaseEnv {
  const env = readSupabaseEnv();
  if (!env) {
    throw new SupabaseNotConfiguredError();
  }
  return env;
}

/** Returns null instead of throwing — for code paths (like proxy) that must degrade gracefully. */
export function getSupabaseEnvSafe(): SupabaseEnv | null {
  return readSupabaseEnv();
}
