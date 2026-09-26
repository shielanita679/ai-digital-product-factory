import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isMigrationNotAppliedError } from "@/lib/supabase/db-error";
import { resolveDesignDisplayUrls } from "@/lib/storage/resolve-design-display-urls";
import { resolveVectorizationsForDesigns } from "@/lib/vector/vectorize-service";
import { resolveMockupDisplayUrls } from "@/lib/bundles/mockup-service";
import { MockupStorage } from "@/lib/storage/mockup-storage";
import { BundleDetail } from "@/components/bundles/bundle-detail";
import { ListingLicenseSection } from "@/components/listings/listing-license-section";
import { BundlePackageSection } from "@/components/packages/bundle-package-section";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; bundleId: string }>;
}): Promise<Metadata> {
  const { bundleId } = await params;
  const supabase = await createClient();
  const { data: bundle } = await supabase.from("product_bundles").select("name").eq("id", bundleId).single();
  return { title: bundle?.name ?? "Bundle" };
}

export default async function BundleDetailPage({
  params,
}: {
  params: Promise<{ id: string; bundleId: string }>;
}) {
  const { id: projectId, bundleId } = await params;
  const supabase = await createClient();

  // Neither depends on the other's result — both are keyed only by the
  // route params — so they run concurrently rather than as two serialized
  // round-trips.
  const [
    { data: project, error: projectError },
    { data: bundle, error: bundleError },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase.from("product_bundles").select("*").eq("id", bundleId).eq("project_id", projectId).single(),
  ]);
  if (projectError || !project) notFound();
  if (bundleError || !bundle) notFound();

  // designs/bundleItems/mockups/listings/packages/coverUrl are all
  // independent of each other (each keyed only by projectId/bundleId, or —
  // for coverUrl — by `bundle` which is already resolved above), so all six
  // run concurrently instead of six serialized round-trips. listings/
  // packages are still queried separately (not joined to designs/mockups)
  // so a not-yet-applied Phase 9/10 migration degrades gracefully instead
  // of breaking the whole page.
  const [
    { data: designs },
    { data: bundleItems },
    { data: mockups },
    { data: listingsData, error: listingsError },
    { data: packagesData, error: packagesError },
    coverUrl,
  ] = await Promise.all([
    supabase.from("designs").select("*").eq("project_id", projectId).order("variation_index", { ascending: true }),
    supabase.from("bundle_items").select("*").eq("bundle_id", bundleId),
    supabase.from("mockups").select("*").eq("bundle_id", bundleId).order("created_at", { ascending: true }),
    supabase.from("product_listings").select("*").eq("bundle_id", bundleId).order("created_at", { ascending: true }),
    supabase.from("product_packages").select("*").eq("bundle_id", bundleId),
    bundle.cover_storage_path ? new MockupStorage(supabase).createSignedUrl(bundle.cover_storage_path) : Promise.resolve(null),
  ]);

  const listingsMigrationApplied = !isMigrationNotAppliedError(listingsError);
  const listings = listingsMigrationApplied ? (listingsData ?? []) : [];
  const packagesMigrationApplied = !isMigrationNotAppliedError(packagesError);
  const packages = packagesMigrationApplied ? (packagesData ?? []) : [];

  // All three depend only on designs/mockups above, never on each other.
  const [displayUrlById, vectorizationByDesignId, mockupDisplayUrlById] = await Promise.all([
    resolveDesignDisplayUrls(supabase, designs ?? []),
    resolveVectorizationsForDesigns(supabase, (designs ?? []).map((d) => d.id)),
    resolveMockupDisplayUrls(supabase, mockups ?? []),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <BundleDetail
        project={project}
        bundle={bundle}
        designs={designs ?? []}
        bundleItems={bundleItems ?? []}
        mockups={mockups ?? []}
        displayUrlById={displayUrlById}
        vectorizationByDesignId={vectorizationByDesignId}
        mockupDisplayUrlById={mockupDisplayUrlById}
        coverUrl={coverUrl}
      />
      {listingsMigrationApplied && (
        <div className="mx-auto w-full max-w-4xl">
          <ListingLicenseSection bundleId={bundleId} listings={listings} />
        </div>
      )}
      {packagesMigrationApplied && (
        <div className="mx-auto w-full max-w-4xl">
          <BundlePackageSection bundleId={bundleId} packages={packages} />
        </div>
      )}
    </div>
  );
}
