import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { getAuthState } from "@/lib/supabase/current-user";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";

export const metadata: Metadata = {
  title: "Profile Settings",
};

export default async function ProfileSettingsPage() {
  const auth = await getAuthState();

  if (auth.status !== "authenticated") {
    redirect("/login");
  }

  return <ProfileSettingsForm profile={auth.profile} email={auth.user.email ?? ""} />;
}
