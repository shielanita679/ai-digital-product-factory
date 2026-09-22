"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { duplicateProjectAction } from "@/app/actions/projects";

export function DuplicateProjectButton({
  projectId,
  onDuplicated,
}: {
  projectId: string;
  /** If provided (e.g. on the detail page), called with the new project's id instead of router.refresh(). */
  onDuplicated?: (newProjectId: string) => void;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setIsPending(true);
    setError(null);
    const result = await duplicateProjectAction({ id: projectId });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (onDuplicated) {
      onDuplicated(result.data.id);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
        Duplicate
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
