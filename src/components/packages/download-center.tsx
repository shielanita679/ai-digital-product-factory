"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Download, RotateCcw, Trash2, FolderOpen, PackageOpen } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { buildPackageAction, deletePackageAction, getPackageDownloadUrlAction } from "@/app/actions/packages";
import { marketplaceLabel } from "@/config/marketplaces";
import { packageStatusLabel, formatFileSize } from "@/config/packages";
import type { PackageWithContext } from "@/lib/packages/package-service";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function PackageCard({ pkg }: { pkg: PackageWithContext }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [isRebuilding, setIsRebuilding] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function handleRebuild() {
    setIsRebuilding(true);
    setError(null);
    const result = await buildPackageAction({ bundleId: pkg.bundle_id, marketplace: pkg.marketplace as "generic" | "etsy" });
    setIsRebuilding(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);
    const result = await getPackageDownloadUrlAction({ id: pkg.id });
    setIsDownloading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const link = document.createElement("a");
    link.href = result.data.url;
    link.download = result.data.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deletePackageAction({ id: pkg.id });
    setIsDeleting(false);
    setConfirmDelete(false);
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
            <p className="truncate text-sm font-medium">{pkg.bundleName}</p>
            <p className="truncate text-xs text-muted-foreground">{pkg.projectName}</p>
          </div>
          <Badge variant={pkg.status === "failed" ? "outline" : "success"}>{pkg.status === "failed" ? "Ready (rebuild failed)" : packageStatusLabel(pkg.status)}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{marketplaceLabel(pkg.marketplace)}</span>
          <span>v{pkg.version}</span>
          <span>{formatFileSize(pkg.file_size_bytes)}</span>
          <span>{pkg.item_count} file{pkg.item_count === 1 ? "" : "s"}</span>
          <span>Updated {formatDate(pkg.updated_at)}</span>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Download ZIP
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleRebuild} disabled={isRebuilding}>
            {isRebuilding ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            Rebuild
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href={`/dashboard/products/${pkg.projectId}/bundles/${pkg.bundle_id}`}>
              <FolderOpen className="size-3.5" />
              Open Bundle
            </Link>
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={isDeleting}>
            {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Delete
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this package?</DialogTitle>
            <DialogDescription>This removes the built ZIP from storage. You can build it again later from the bundle page.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function DownloadCenter({ packages }: { packages: PackageWithContext[] }) {
  if (packages.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="No packages yet"
        description="Build a package from a bundle's Package section to see it here, ready to download."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => (
        <PackageCard key={pkg.id} pkg={pkg} />
      ))}
    </div>
  );
}
