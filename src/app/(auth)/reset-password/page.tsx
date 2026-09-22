import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { SupabaseSetupNotice } from "@/components/dashboard/supabase-setup-notice";
import { getAuthState } from "@/lib/supabase/current-user";

export const metadata: Metadata = {
  title: "Choose a New Password",
};

export default async function ResetPasswordPage() {
  const auth = await getAuthState();

  if (auth.status === "not-configured") {
    return <SupabaseSetupNotice />;
  }

  // Reaching this page requires the recovery link from /auth/confirm to
  // have already established a session — otherwise send them to request one.
  if (auth.status === "unauthenticated") {
    redirect("/forgot-password");
  }

  return <ResetPasswordForm />;
}
