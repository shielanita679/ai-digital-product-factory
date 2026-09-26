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

  // Carries the original `type` through so /auth/auth-code-error can show
  // signup-appropriate vs. recovery-appropriate copy instead of a single
  // generic message for both — see that page's own comment for why.
  const errorRedirect = new URL("/auth/auth-code-error", origin);
  if (type) errorRedirect.searchParams.set("type", type);
  return NextResponse.redirect(errorRedirect);
}
