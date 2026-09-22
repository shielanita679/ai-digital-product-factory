import type { Metadata } from "next";
import Link from "next/link";
import { DatabaseZap, FolderKanban, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ProjectCard } from "@/components/products/project-card";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/db-error";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My Products",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived: archivedParam } = await searchParams;
  const showArchived = archivedParam === "1";

  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("archived", showArchived)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every product you&apos;ve started, in one place.
          </p>
        </div>
        <Button variant="brand" asChild>
          <Link href="/dashboard/create">
            <Sparkles className="size-4" />
            New Product
          </Link>
        </Button>
      </div>

      <div className="flex gap-2 border-b border-border">
        {[
          { label: "Active", href: "/dashboard/products", active: !showArchived },
          { label: "Archived", href: "/dashboard/products?archived=1", active: showArchived },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {error && isMissingTableError(error) && (
        <EmptyState
          icon={DatabaseZap}
          title="Product management isn't set up yet"
          description="The database migration for products hasn't been applied to this project yet. See supabase/README.md."
        />
      )}

      {error && !isMissingTableError(error) && (
        <p className="text-sm text-destructive">Couldn&apos;t load products: {error.message}</p>
      )}

      {!error && projects && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} showActions />
          ))}
        </div>
      )}

      {!error && projects && projects.length === 0 && !showArchived && (
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

      {!error && projects && projects.length === 0 && showArchived && (
        <EmptyState
          icon={FolderKanban}
          title="No archived products"
          description="Products you archive will show up here."
        />
      )}
    </div>
  );
}
