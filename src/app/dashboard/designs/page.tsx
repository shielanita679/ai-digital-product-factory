import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DatabaseZap, Palette } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DesignGallery } from "@/components/generation/design-gallery";
import { createClient } from "@/lib/supabase/server";
import { isMigrationNotAppliedError } from "@/lib/supabase/db-error";
import { resolveDesignDisplayUrls } from "@/lib/storage/resolve-design-display-urls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Designs",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

export default async function DesignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeFilter: FilterValue = FILTERS.some((f) => f.value === status) ? (status as FilterValue) : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let query = supabase.from("designs").select("*").order("created_at", { ascending: false });
  if (activeFilter !== "all") {
    query = query.eq("status", activeFilter);
  }
  const { data: designs, error } = await query;

  if (isMigrationNotAppliedError(error)) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={DatabaseZap}
          title="Designs aren't set up yet"
          description="The database migration for the generation pipeline hasn't been applied to this project yet."
        />
      </div>
    );
  }

  const projectIds = Array.from(new Set((designs ?? []).map((d) => d.project_id)));
  const projectNameById: Record<string, string> = {};
  if (projectIds.length > 0) {
    const { data: projects } = await supabase.from("projects").select("id, name").in("id", projectIds);
    for (const p of projects ?? []) {
      projectNameById[p.id] = p.name;
    }
  }
  const displayUrlById = await resolveDesignDisplayUrls(supabase, designs ?? []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Designs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every design generated across your products. Real AI-generated designs and development
          Mock previews are both shown here, clearly labeled.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter designs by status">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "all" ? "/dashboard/designs" : `/dashboard/designs?status=${filter.value}`}
            role="tab"
            aria-selected={activeFilter === filter.value}
          >
            <Badge
              variant={activeFilter === filter.value ? "default" : "outline"}
              className={cn("cursor-pointer px-3 py-1.5", activeFilter === filter.value && "shadow-sm")}
            >
              {filter.label}
            </Badge>
          </Link>
        ))}
      </div>

      {designs && designs.length > 0 ? (
        <DesignGallery
          designs={designs}
          displayUrlById={displayUrlById}
          showProjectNames
          projectNameById={projectNameById}
        />
      ) : (
        <EmptyState
          icon={Palette}
          title={activeFilter === "all" ? "No designs yet" : `No ${activeFilter} designs`}
          description={
            activeFilter === "all"
              ? "Generate designs from a product's detail page to see them here."
              : "Try a different filter, or generate more designs from a product's detail page."
          }
        />
      )}
    </div>
  );
}
