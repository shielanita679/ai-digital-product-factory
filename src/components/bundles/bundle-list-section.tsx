"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Layers, Image as ImageIcon, ExternalLink } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateBundleForm } from "@/components/bundles/create-bundle-form";
import { EmptyState } from "@/components/dashboard/empty-state";
import { deleteBundleAction } from "@/app/actions/bundles";
import { bundleStatusMeta, bundleStatusLabel } from "@/config/bundles";
import type { ProductBundle } from "@/types/supabase";

function BundleCard({ bundle, projectId }: { bundle: ProductBundle; projectId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const statusMeta = bundleStatusMeta[bundle.status as keyof typeof bundleStatusMeta];

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteBundleAction({ id: bundle.id });
    setIsDeleting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/dashboard/products/${projectId}/bundles/${bundle.id}`} className="line-clamp-1 font-medium hover:underline">
              {bundle.name}
            </Link>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={statusMeta?.badgeVariant ?? "outline"}>{bundleStatusLabel(bundle.status)}</Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Layers className="size-3.5" />
            {bundle.item_count} design{bundle.item_count === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1">
            <ImageIcon className="size-3.5" />
            {bundle.mockup_count} mockup{bundle.mockup_count === 1 ? "" : "s"}
          </span>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="mt-auto flex gap-2 pt-1">
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/dashboard/products/${projectId}/bundles/${bundle.id}`}>
              <ExternalLink className="size-3.5" />
              Open
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BundleListSection({ projectId, bundles }: { projectId: string; bundles: ProductBundle[] }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">Bundles</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Assemble selected designs into a sellable bundle with mockups and a cover.
      </p>

      <Card className="mt-4">
        <CardContent className="p-4">
          <CreateBundleForm projectId={projectId} />
        </CardContent>
      </Card>

      <div className="mt-4">
        {bundles.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((bundle) => (
              <BundleCard key={bundle.id} bundle={bundle} projectId={projectId} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Layers} title="No bundles yet" description="Create a bundle above to start assembling a sellable product." compact />
        )}
      </div>
    </div>
  );
}
