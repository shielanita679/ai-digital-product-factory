"use client";

import { useRouter } from "next/navigation";

import { RenameProjectDialog } from "@/components/products/rename-project-dialog";
import { DuplicateProjectButton } from "@/components/products/duplicate-project-button";
import { ArchiveProjectButton } from "@/components/products/archive-project-button";
import { DeleteProjectDialog } from "@/components/products/delete-project-dialog";

export function ProjectDetailActions({
  projectId,
  projectName,
  archived,
}: {
  projectId: string;
  projectName: string;
  archived: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-2">
      <RenameProjectDialog projectId={projectId} currentName={projectName} />
      <DuplicateProjectButton
        projectId={projectId}
        onDuplicated={(newId) => router.push(`/dashboard/products/${newId}`)}
      />
      <ArchiveProjectButton projectId={projectId} archived={archived} />
      <DeleteProjectDialog
        projectId={projectId}
        projectName={projectName}
        onDeleted={() => router.push("/dashboard/products")}
      />
    </div>
  );
}
