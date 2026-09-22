export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example), then restart the dev server.",
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

type SupabaseEnv = {
  url: string;
  /** The client-safe key — a new-format `sb_publishable_...` key, or a
   *  legacy anon JWT. Both work as a drop-in value for the Supabase SDK. */
  publishableKey: string;
};

function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer the current Supabase key naming; fall back to the legacy "anon
  // key" env var name so older Supabase projects keep working unchanged.
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
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
