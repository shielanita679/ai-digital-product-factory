import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  DatabaseZap,
  ImageIcon,
  FileText,
  PackageCheck,
  Palette,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ProjectDetailActions } from "@/components/products/project-detail-actions";
import { GenerateDesignsSection } from "@/components/generation/generate-designs-section";
import { DesignGallery } from "@/components/generation/design-gallery";
import { productTypeLabel, projectStatusLabel, projectStatusMeta } from "@/config/product-types";
import { styleOptions } from "@/config/styles";
import { audienceOptions } from "@/config/audiences";
import {
  labelFor,
  contentModeOptions,
  colorModeOptions,
  orientationOptions,
  detailLevelOptions,
} from "@/config/design-options";
import { createClient } from "@/lib/supabase/server";
import { isMigrationNotAppliedError } from "@/lib/supabase/db-error";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("name").eq("id", id).single();
  return { title: project?.name ?? "Product" };
}

const futureSections = [
  { icon: ImageIcon, title: "Mockups", description: "Product mockups (t-shirts, mugs, posters, and more) will appear here." },
  { icon: FileText, title: "Listing", description: "Generated title, description, tags, and pricing will appear here." },
  { icon: PackageCheck, title: "Package", description: "The final downloadable ZIP package will appear here." },
];

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error && isMigrationNotAppliedError(error)) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={DatabaseZap}
          title="Product management isn't set up yet"
          description="The database migration for products hasn't been applied to this project yet."
        />
      </div>
    );
  }

  if (error || !project) {
    notFound();
  }

  // Phase 5 data — queried separately so a not-yet-applied Phase 5
  // migration degrades gracefully instead of breaking the whole page
  // (the project itself already loaded fine above).
  const [latestJobResult, designsResult] = await Promise.all([
    supabase
      .from("generation_jobs")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("designs")
      .select("*")
      .eq("project_id", project.id)
      .order("variation_index", { ascending: true }),
  ]);

  const generationMigrationApplied = !isMigrationNotAppliedError(latestJobResult.error ?? designsResult.error);
  const latestJob = generationMigrationApplied ? (latestJobResult.data ?? null) : null;
  const designs = generationMigrationApplied ? (designsResult.data ?? []) : [];

  const statusMeta = projectStatusMeta[project.status as keyof typeof projectStatusMeta];

  // Present only for projects created via the Phase 4 wizard — absent
  // (null) for Phase 3 projects, and absent from the row entirely
  // (undefined, not just null) if this migration hasn't been applied yet.
  // Either way, this is a safe single signal to gate on.
  const hasWizardConfig = Boolean(project.user_prompt);
  const canGenerate = generationMigrationApplied && hasWizardConfig && !project.archived;
  const disabledReason = !generationMigrationApplied
    ? "The generation pipeline's database migration hasn't been applied yet."
    : !hasWizardConfig
      ? "This product hasn't completed the setup wizard yet."
      : project.archived
        ? "Unarchive this product before generating designs."
        : null;
  const styles = project.style ?? [];
  const audiences = project.target_audience ?? [];
  const customColors = project.custom_colors ?? [];

  const styleText =
    [...styles.map((v) => labelFor(styleOptions, v)), project.custom_style?.trim()]
      .filter(Boolean)
      .join(", ") || "Not specified";
  const audienceText =
    [...audiences.map((v) => labelFor(audienceOptions, v)), project.custom_audience?.trim()]
      .filter(Boolean)
      .join(", ") || "Anyone";
  const colorText =
    project.color_mode === "custom"
      ? customColors.join(", ") || "Custom colors"
      : labelFor(colorModeOptions, project.color_mode ?? "no_preference");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href="/dashboard/products"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to My Products
      </Link>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <Badge variant={statusMeta?.badgeVariant ?? "outline"}>
              {projectStatusLabel(project.status)}
            </Badge>
            {project.archived && <Badge variant="outline">Archived</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {productTypeLabel(project.product_type)}
          </p>
        </div>

        <ProjectDetailActions
          projectId={project.id}
          projectName={project.name}
          archived={project.archived}
        />
      </div>

      {!generationMigrationApplied && (
        <EmptyState
          icon={DatabaseZap}
          title="Design generation isn't set up yet"
          description="The database migration for the generation pipeline hasn't been applied to this project yet."
          compact
        />
      )}

      {generationMigrationApplied && (
        <GenerateDesignsSection
          projectId={project.id}
          initialJob={latestJob}
          canGenerate={canGenerate}
          disabledReason={disabledReason}
        />
      )}

      <Card>
        <CardContent className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Product type</p>
            <p className="mt-1 text-sm font-medium">{productTypeLabel(project.product_type)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-1 text-sm font-medium">{projectStatusLabel(project.status)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Designs</p>
            <p className="mt-1 text-sm font-medium">{project.design_count}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="mt-1 text-sm font-medium">{formatDate(project.created_at)}</p>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-muted-foreground">Last updated</p>
            <p className="mt-1 text-sm font-medium">{formatDate(project.updated_at)}</p>
          </div>
        </CardContent>
      </Card>

      {hasWizardConfig && (
        <div>
          <h2 className="text-lg font-semibold">Product setup</h2>
          <Card className="mt-3">
            <CardContent className="divide-y divide-border p-5">
              <div className="py-3 first:pt-0">
                <p className="text-xs font-medium text-muted-foreground">Original idea</p>
                <p className="mt-0.5 text-sm">{project.user_prompt}</p>
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 py-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Style</p>
                  <p className="mt-0.5 text-sm">{styleText}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Target audience</p>
                  <p className="mt-0.5 text-sm">{audienceText}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Requested designs</p>
                  <p className="mt-0.5 text-sm">{project.requested_design_count}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Content mode</p>
                  <p className="mt-0.5 text-sm">
                    {labelFor(contentModeOptions, project.content_mode ?? "text_and_graphics")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Colors</p>
                  <p className="mt-0.5 text-sm">{colorText}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Transparent background</p>
                  <p className="mt-0.5 text-sm">{project.transparent_background ? "On" : "Off"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Orientation</p>
                  <p className="mt-0.5 text-sm">
                    {labelFor(orientationOptions, project.orientation ?? "square")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Detail level</p>
                  <p className="mt-0.5 text-sm">
                    {labelFor(detailLevelOptions, project.detail_level ?? "medium")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {generationMigrationApplied && (
        <div>
          <h2 className="text-lg font-semibold">Designs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {designs.length > 0
              ? `${project.design_count} of ${designs.length} design${designs.length === 1 ? "" : "s"} completed.`
              : "Generated designs for this product will appear here."}
          </p>
          <div className="mt-4">
            {designs.length > 0 ? (
              <DesignGallery designs={designs} />
            ) : (
              <EmptyState
                icon={Palette}
                title="No designs yet"
                description="Click Generate Designs above to create your first mock preview batch."
                compact
              />
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold">What&apos;s next</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These arrive in later phases of the build.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {futureSections.map((section) => (
            <EmptyState
              key={section.title}
              icon={section.icon}
              title={section.title}
              description={section.description}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}
