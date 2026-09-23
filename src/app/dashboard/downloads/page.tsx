import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DatabaseZap } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { DownloadCenter } from "@/components/packages/download-center";
import { createClient } from "@/lib/supabase/server";
import { isMigrationNotAppliedError } from "@/lib/supabase/db-error";
import { loadMyPackages } from "@/lib/packages/package-service";

export const metadata: Metadata = {
  title: "Downloads",
};

export default async function DownloadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Probed directly (not via loadMyPackages, which silently degrades to an
  // empty list for a not-yet-applied migration the same way every other
  // Phase 6+ table's service does) so this page can distinguish "migration
  // not applied yet" from "genuinely zero packages built" — the same
  // pattern the bundle detail page uses for product_listings/
  // product_packages.
  const { error: probeError } = await supabase.from("product_packages").select("id").limit(1);
  if (isMigrationNotAppliedError(probeError)) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={DatabaseZap}
          title="Downloads aren't set up yet"
          description="The database migration for package downloads hasn't been applied to this project yet."
        />
      </div>
    );
  }

  const packages = await loadMyPackages({ supabase, userId: user.id });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Downloads</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every package you&apos;ve built, ready to download.</p>
      </div>
      <DownloadCenter packages={packages} />
    </div>
  );
}
