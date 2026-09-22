import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, DatabaseZap, Palette, ImageIcon, FileText, PackageCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ProjectDetailActions } from "@/components/products/project-detail-actions";
import { productTypeLabel, projectStatusLabel, projectStatusMeta } from "@/config/product-types";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/db-error";

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
  { icon: Palette, title: "Designs", description: "AI-generated artwork for this product will appear here." },
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

  if (error && isMissingTableError(error)) {
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

  const statusMeta = projectStatusMeta[project.status as keyof typeof projectStatusMeta];

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
