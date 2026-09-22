import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseSetupNotice } from "@/components/dashboard/supabase-setup-notice";
import { getAuthState } from "@/lib/supabase/current-user";
import { completeOnboardingAction } from "@/app/actions/onboarding";

export const metadata: Metadata = {
  title: "Welcome",
};

export default async function OnboardingPage() {
  const auth = await getAuthState();

  if (auth.status === "not-configured") {
    return <SupabaseSetupNotice />;
  }

  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  const { profile } = auth;

  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Logo />

      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-brand-gradient text-white">
            <Sparkles className="size-6" />
          </span>
          <CardTitle className="text-xl">
            You&apos;re in, {profile?.full_name?.split(" ")[0] ?? "there"}
          </CardTitle>
          <CardDescription>
            The full setup — what you sell, where you sell it, and how many
            products a month — arrives with the onboarding flow in a later
            phase of the build. For now, head to your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={completeOnboardingAction}>
            <Button type="submit" variant="brand" className="w-full">
              Continue to Dashboard
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
