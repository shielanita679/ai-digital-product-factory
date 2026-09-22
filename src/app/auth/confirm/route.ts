import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Landing point for Supabase email links (signup confirmation and password
 * recovery). Verifies the token, establishes a session, then redirects.
 *
 * Requires the Supabase email templates to link here — see supabase/README.md.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  if (tokenHash && type) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });

      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch {
      // Falls through to the error redirect below (covers a missing
      // Supabase configuration too — nothing more we can do here).
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
