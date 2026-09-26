import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Link Expired",
};

/**
 * A single generic message here used to say "Request a New Reset Link"
 * for BOTH a failed password-recovery link AND a failed signup-
 * confirmation link — misleading for the latter, since there's no reset
 * to request. /auth/confirm now passes the original `type` through on
 * this redirect (see that route's own comment), so this page can show
 * copy that actually matches what failed.
 *
 * The non-recovery copy below reflects a live-verified mechanism (Phase
 * 11 auth pre-flight audit): Supabase's default "Confirm signup" email
 * template can confirm the user's email server-side even when the link
 * fails to hand a session to THIS app (a deferred SMTP/template
 * configuration issue — see docs/PRE_LAUNCH_CHECKLIST.md — not something
 * fixed here). So a signup-confirmation failure genuinely might mean the
 * account already works; we say that honestly rather than promising a
 * "resend confirmation" feature that doesn't exist.
 */
export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const isRecovery = type === "recovery";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Logo />

      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </span>
          <CardTitle as="h1" className="text-xl">
            That link didn&apos;t work
          </CardTitle>
          <CardDescription>
            {isRecovery
              ? "It may have expired or already been used. Request a new one to continue."
              : "It may have expired or already been used. If you were confirming a new account, you may already be able to log in — otherwise, try registering again."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isRecovery ? (
            <>
              <Button variant="brand" asChild>
                <Link href="/forgot-password">Request a New Reset Link</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/login">Back to Login</Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="brand" asChild>
                <Link href="/login">Try Logging In</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/register">Register Again</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
