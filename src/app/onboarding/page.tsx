import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SupabaseSetupNotice } from "@/components/dashboard/supabase-setup-notice";
import { getAuthState } from "@/lib/supabase/current-user";

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

  // Already done this before — don't make them repeat it.
  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  const firstName = profile?.full_name?.trim().split(" ")[0] || null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <Logo />
      <OnboardingWizard firstName={firstName} />
    </div>
  );
}
