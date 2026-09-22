import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SupabaseSetupNotice } from "@/components/dashboard/supabase-setup-notice";
import { signOutAction } from "@/app/actions/auth";
import { getAuthState } from "@/lib/supabase/current-user";

function getInitials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "?";
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthState();

  if (auth.status === "not-configured") {
    return <SupabaseSetupNotice />;
  }

  // The proxy already redirects unauthenticated requests to /login before
  // they reach this layout — this check is defense in depth, never relied
  // on alone (see the Next.js Proxy docs' Data Security guidance).
  if (auth.status === "unauthenticated") {
    redirect("/login");
  }

  const { user, profile } = auth;

  // New users who haven't finished onboarding land here first; the
  // onboarding page itself redirects back to /dashboard once complete, so
  // this never loops.
  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <DashboardShell
      email={user.email ?? ""}
      initials={getInitials(profile?.full_name, user.email ?? "")}
      onSignOut={signOutAction}
    >
      {children}
    </DashboardShell>
  );
}
