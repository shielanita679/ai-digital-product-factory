import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAuthState } from "@/lib/supabase/current-user";

export const metadata: Metadata = {
  title: "Security Settings",
};

export default async function SecuritySettingsPage() {
  const auth = await getAuthState();

  if (auth.status !== "authenticated") {
    redirect("/login");
  }

  const createdAt = auth.profile?.created_at
    ? new Date(auth.profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Email:</span> {auth.user.email}
          </p>
          {createdAt && (
            <p>
              <span className="text-muted-foreground">Member since:</span> {createdAt}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Password</CardTitle>
          <CardDescription>
            Changing your password here isn&apos;t available yet — use the password-reset email flow instead. We&apos;re
            aware production email delivery for this flow needs additional setup (custom SMTP + email template
            configuration) before it&apos;s fully reliable end-to-end; this is tracked as a pre-launch task, not
            something we&apos;re building an insecure workaround for.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/forgot-password">Request a password reset</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
