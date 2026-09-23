import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveDesignDisplayUrls } from "@/lib/storage/resolve-design-display-urls";
import { resolveVectorizationsForDesigns } from "@/lib/vector/vectorize-service";
import { resolveMockupDisplayUrls } from "@/lib/bundles/mockup-service";
import { MockupStorage } from "@/lib/storage/mockup-storage";
import { BundleDetail } from "@/components/bundles/bundle-detail";

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

  const { data: project, error: projectError } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (projectError || !project) notFound();

  const { data: bundle, error: bundleError } = await supabase.from("product_bundles").select("*").eq("id", bundleId).eq("project_id", projectId).single();
  if (bundleError || !bundle) notFound();

  const { data: designs } = await supabase
    .from("designs")
    .select("*")
    .eq("project_id", projectId)
    .order("variation_index", { ascending: true });

  const { data: bundleItems } = await supabase.from("bundle_items").select("*").eq("bundle_id", bundleId);

  const { data: mockups } = await supabase.from("mockups").select("*").eq("bundle_id", bundleId).order("created_at", { ascending: true });

  const displayUrlById = await resolveDesignDisplayUrls(supabase, designs ?? []);
  const vectorizationByDesignId = await resolveVectorizationsForDesigns(supabase, (designs ?? []).map((d) => d.id));
  const mockupDisplayUrlById = await resolveMockupDisplayUrls(supabase, mockups ?? []);

  let coverUrl: string | null = null;
  if (bundle.cover_storage_path) {
    const storage = new MockupStorage(supabase);
    coverUrl = await storage.createSignedUrl(bundle.cover_storage_path);
  }

  return (
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
  );
}
