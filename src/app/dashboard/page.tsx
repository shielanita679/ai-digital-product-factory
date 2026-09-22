import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins, DatabaseZap, FolderKanban, Palette, Download, Sparkles, LayoutTemplate } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ProjectCard } from "@/components/products/project-card";
import { DesignCard } from "@/components/generation/design-card";
import { createClient } from "@/lib/supabase/server";
import { isMigrationNotAppliedError } from "@/lib/supabase/db-error";
import { resolveDesignDisplayUrls } from "@/lib/storage/resolve-design-display-urls";
import { getPlan } from "@/config/plans";

export const metadata: Metadata = {
  title: "Dashboard",
};

const templateTeasers = [
  "Christmas SVG Bundle",
  "Halloween SVG Bundle",
  "Funny Cat Bundle",
  "Teacher SVG Bundle",
  "Wedding SVG",
  "Floral Bundle",
];

const freePlan = getPlan("free");

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The layout already guarantees a session; this is defense in depth.
  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, projectsResult, countResult, recentDesignsResult, designsCountResult] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("projects")
        .select("*")
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("archived", false),
      supabase.from("designs").select("*").order("created_at", { ascending: false }).limit(4),
      supabase.from("designs").select("*", { count: "exact", head: true }).eq("status", "completed"),
    ]);

  const firstName = profile?.full_name?.trim().split(" ")[0] || null;
  const projectsMigrationMissing = isMigrationNotAppliedError(projectsResult.error);
  const recentProjects = projectsResult.data;
  const designsMigrationMissing = isMigrationNotAppliedError(recentDesignsResult.error);
  const recentDesigns = designsMigrationMissing ? [] : (recentDesignsResult.data ?? []);
  const recentDesignsDisplayUrlById = await resolveDesignDisplayUrls(supabase, recentDesigns);

  const stats = [
    { label: "Credits remaining", value: "—", icon: Coins, note: "Coming soon" },
    {
      label: "Products",
      value: projectsMigrationMissing ? "—" : String(countResult.count ?? 0),
      icon: FolderKanban,
      note: projectsMigrationMissing ? "Migration not applied yet" : undefined,
    },
    {
      label: "Designs generated",
      value: designsMigrationMissing ? "—" : String(designsCountResult.count ?? 0),
      icon: Palette,
      note: designsMigrationMissing ? "Migration not applied yet" : undefined,
    },
    { label: "Downloads", value: "—", icon: Download, note: "Coming soon" },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with your products.
          </p>
        </div>
        <Button variant="brand" asChild>
          <Link href="/dashboard/create">
            <Sparkles className="size-4" />
            Create Product
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-xl font-semibold leading-none" title={stat.note}>
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent products</h2>
            {recentProjects && recentProjects.length > 0 && (
              <Link
                href="/dashboard/products"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            )}
          </div>

          {projectsMigrationMissing ? (
            <EmptyState
              icon={DatabaseZap}
              title="Product management isn't set up yet"
              description="The database migration for products hasn't been applied to this project yet."
            />
          ) : recentProjects && recentProjects.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="No products yet"
              description="Turn your first idea into a complete digital product."
              action={
                <Button variant="brand" asChild>
                  <Link href="/dashboard/create">
                    <Sparkles className="size-4" />
                    Create Product
                  </Link>
                </Button>
              }
            />
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current plan</CardTitle>
              <CardDescription>Billing isn&apos;t connected yet.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{freePlan.name} plan</p>
                <p className="text-xs text-muted-foreground">Default for new accounts</p>
              </div>
              <Button variant="outline" size="sm" disabled className="opacity-70">
                Upgrade
              </Button>
            </CardContent>
          </Card>

          {recentDesigns.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  Recent designs
                  <Link href="/dashboard/designs" className="text-sm font-medium text-primary hover:underline">
                    View all
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {recentDesigns.map((design) => (
                  <DesignCard
                    key={design.id}
                    design={design}
                    displayUrl={recentDesignsDisplayUrlById.get(design.id) ?? null}
                  />
                ))}
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={Palette}
              title="No designs yet"
              description="Generated designs will show up here."
              compact
            />
          )}

          <EmptyState
            icon={Download}
            title="No downloads yet"
            description="Finished product packages will show up here."
            compact
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutTemplate className="size-4" />
            Quick-start templates
          </CardTitle>
          <CardDescription>Preview only for now — generation arrives in a later phase.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {templateTeasers.map((template) => (
            <Badge
              key={template}
              variant="outline"
              className="cursor-not-allowed px-3 py-1.5 text-muted-foreground/60"
            >
              {template}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
