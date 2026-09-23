"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package as PackageIcon, Download, RotateCcw, Trash2, AlertTriangle, Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { buildPackageAction, deletePackageAction, getPackageDownloadUrlAction, checkPackagePrerequisitesAction } from "@/app/actions/packages";
import { marketplaceOptions, type MarketplaceId } from "@/config/marketplaces";
import { packageStatusMeta, packageStatusLabel, hasDownloadablePackage, formatFileSize } from "@/config/packages";
import type { ProductPackage } from "@/types/supabase";
import type { PrerequisiteCheck } from "@/lib/packages/package-service";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function BundlePackageSection({ bundleId, packages }: { bundleId: string; packages: ProductPackage[] }) {
  const [marketplace, setMarketplace] = React.useState<MarketplaceId>("generic");
  const pkg = packages.find((p) => p.marketplace === marketplace) ?? null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Package</p>
            <p className="text-xs text-muted-foreground">Build a downloadable ZIP of the selected assets, mockups, cover, listing, and license.</p>
          </div>
          <Select value={marketplace} onChange={(e) => setMarketplace(e.target.value as MarketplaceId)} aria-label="Package marketplace" className="h-8 w-32 text-xs">
            {marketplaceOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>

        <PackageBody key={`${marketplace}:${pkg?.id ?? "none"}:${pkg?.updated_at ?? ""}`} bundleId={bundleId} marketplace={marketplace} pkg={pkg} />
      </CardContent>
    </Card>
  );
}

function PackageBody({ bundleId, marketplace, pkg }: { bundleId: string; marketplace: MarketplaceId; pkg: ProductPackage | null }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [isBuilding, setIsBuilding] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [prereq, setPrereq] = React.useState<PrerequisiteCheck | null>(null);
  const [checkingPrereq, setCheckingPrereq] = React.useState(true);

  React.useEffect(() => {
    // No setCheckingPrereq(true) here: PackageBody is keyed by marketplace
    // in BundlePackageSection (mirrors ListingBody's key trick), so a
    // marketplace switch already remounts this component with
    // checkingPrereq back at its true initial value — nothing to
    // synchronously reset mid-effect.
    let cancelled = false;
    checkPackagePrerequisitesAction({ bundleId, marketplace }).then((result) => {
      if (cancelled) return;
      setCheckingPrereq(false);
      if (result.ok) setPrereq(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [bundleId, marketplace]);

  function refresh() {
    router.refresh();
  }

  async function handleBuild() {
    setIsBuilding(true);
    setError(null);
    const result = await buildPackageAction({ bundleId, marketplace });
    setIsBuilding(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleDownload() {
    if (!pkg) return;
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
    if (!pkg) return;
    setIsDeleting(true);
    setError(null);
    const result = await deletePackageAction({ id: pkg.id });
    setIsDeleting(false);
    setConfirmDelete(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  const downloadable = hasDownloadablePackage(pkg);
  const statusMeta = pkg ? packageStatusMeta[pkg.status as keyof typeof packageStatusMeta] : null;
  const blocking = prereq?.blocking ?? [];
  const warnings = prereq?.warnings ?? [];
  const buildDisabled = isBuilding || checkingPrereq || blocking.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={downloadable ? "success" : (statusMeta?.badgeVariant ?? "outline")}>
          {downloadable && pkg?.status === "failed" ? "Ready (rebuild failed)" : packageStatusLabel(pkg?.status ?? "queued")}
        </Badge>
        {pkg?.version ? <span className="text-xs text-muted-foreground">v{pkg.version}</span> : null}
        {downloadable && (
          <span className="text-xs text-muted-foreground">
            {formatFileSize(pkg?.file_size_bytes)} · {pkg?.item_count} file{pkg?.item_count === 1 ? "" : "s"} · updated {formatDate(pkg?.updated_at ?? null)}
          </span>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5" />
          {error}
        </p>
      )}

      {pkg?.status === "failed" && pkg.error_message && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5" />
          {downloadable ? "Last rebuild failed: " : "Build failed: "}
          {pkg.error_message}
        </p>
      )}

      {blocking.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="size-3.5" />
            Fix before building:
          </p>
          <ul className="ml-5 list-disc text-xs text-destructive">
            {blocking.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && blocking.length === 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Info className="size-3.5" />
            Will be included once available:
          </p>
          <ul className="ml-5 list-disc text-xs text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleBuild} disabled={buildDisabled}>
          {isBuilding ? <Loader2 className="size-3.5 animate-spin" /> : downloadable ? <RotateCcw className="size-3.5" /> : <PackageIcon className="size-3.5" />}
          {downloadable ? "Rebuild Package" : "Build Package"}
        </Button>
        {downloadable && (
          <Button type="button" variant="outline" onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Download ZIP
          </Button>
        )}
        {pkg && (
          <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={isDeleting}>
            {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            Delete Package
          </Button>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this package?</DialogTitle>
            <DialogDescription>
              This removes the built ZIP from storage. You can build it again later from the same selected assets.
            </DialogDescription>
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
    </div>
  );
}
