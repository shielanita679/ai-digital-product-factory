import Link from "next/link";
import { FolderKanban, Layers } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { productTypeLabel, projectStatusLabel, projectStatusMeta } from "@/config/product-types";
import type { Project } from "@/types/supabase";
import { RenameProjectDialog } from "@/components/products/rename-project-dialog";
import { DuplicateProjectButton } from "@/components/products/duplicate-project-button";
import { ArchiveProjectButton } from "@/components/products/archive-project-button";
import { DeleteProjectDialog } from "@/components/products/delete-project-dialog";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProjectCard({
  project,
  showActions = false,
}: {
  project: Project;
  showActions?: boolean;
}) {
  const statusMeta = projectStatusMeta[project.status as keyof typeof projectStatusMeta];

  return (
    <Card className="flex flex-col overflow-hidden">
      <Link href={`/dashboard/products/${project.id}`} className="flex flex-1 flex-col">
        <div className="flex aspect-[4/3] items-center justify-center bg-muted/50 text-muted-foreground">
          {project.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- covers will be user-generated remote images once mockups exist; not worth next/image config yet
            <img
              src={project.cover_url}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <FolderKanban className="size-10" />
          )}
        </div>
        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-sm font-semibold">{project.name}</h3>
            <Badge variant={statusMeta?.badgeVariant ?? "outline"} className="shrink-0">
              {projectStatusLabel(project.status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{productTypeLabel(project.product_type)}</p>
          <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="size-3.5" />
              {project.design_count} design{project.design_count === 1 ? "" : "s"}
            </span>
            <span>{formatDate(project.created_at)}</span>
          </div>
        </CardContent>
      </Link>

      {showActions && (
        <div className="flex flex-wrap gap-2 border-t border-border p-3">
          <RenameProjectDialog projectId={project.id} currentName={project.name} />
          <DuplicateProjectButton projectId={project.id} />
          <ArchiveProjectButton projectId={project.id} archived={project.archived} />
          <DeleteProjectDialog projectId={project.id} projectName={project.name} />
        </div>
      )}
    </Card>
  );
}
