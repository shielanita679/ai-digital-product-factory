"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, RotateCcw, Trash2, Download, Loader2, ImageOff, Sparkles, Shapes } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { designStatusMeta, designStatusLabel, vectorizationStatusMeta, vectorizationStatusLabel, type VectorizationStatus } from "@/config/generation";
import { retryDesignAction, deleteDesignAction, getDesignDownloadUrlAction } from "@/app/actions/generation";
import { vectorizeDesignAction, getVectorizationDownloadUrlAction, deleteVectorizationAction } from "@/app/actions/vectorization";
import type { Design, Vectorization } from "@/types/supabase";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ImagePreview({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = React.useState(false);

  if (!url || failed) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
        <ImageOff className="size-5" />
        <span className="text-xs">{url ? "Image unavailable" : "No preview"}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a mock preview is a self-contained data: URI and a real design is a short-lived signed Storage URL; neither is a fixed remote asset next/image config makes sense for
    <img src={url} alt={title} className="size-full object-contain" onError={() => setFailed(true)} />
  );
}

export function DesignCard({
  design,
  displayUrl,
  vectorization,
  vectorPreviewUrl,
  projectName,
}: {
  design: Design;
  /** Resolved server-side by resolveDesignDisplayUrls — the mock's inline data: URI, or a fresh signed Storage URL for a real design. */
  displayUrl: string | null;
  /** Resolved server-side — null both when this design has no vector result yet and before the Phase 7 migration is applied. */
  vectorization?: Vectorization | null;
  /** Resolved server-side by resolveVectorDisplayUrls — a fresh signed Storage URL for a completed vector, or null. */
  vectorPreviewUrl?: string | null;
  /** Shown in the detail dialog on cross-project views like /dashboard/designs. */
  projectName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isVectorizing, setIsVectorizing] = React.useState(false);
  const [isDownloadingVector, setIsDownloadingVector] = React.useState(false);
  const [isDeletingVector, setIsDeletingVector] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [vectorActionError, setVectorActionError] = React.useState<string | null>(null);
  const statusMeta = designStatusMeta[design.status as keyof typeof designStatusMeta];
  const isFailed = design.status === "failed";
  // A real, durably stored asset — never inferred from `provider` alone,
  // since a real-provider design that hasn't finished (or failed before
  // ever uploading) has no storage object yet either.
  const isRealAsset = design.status === "completed" && Boolean(design.storage_path);

  async function handleRetry() {
    setIsRetrying(true);
    setActionError(null);
    const result = await retryDesignAction({ id: design.id });
    setIsRetrying(false);
    if (!result.ok) {
      setActionError(result.error);
    } else {
      router.refresh();
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setActionError(null);
    const result = await deleteDesignAction({ id: design.id });
    setIsDeleting(false);
    if (!result.ok) {
      setActionError(result.error);
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  async function handleDownload() {
    setIsDownloading(true);
    setActionError(null);
    const result = await getDesignDownloadUrlAction({ id: design.id });
    setIsDownloading(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    const link = document.createElement("a");
    link.href = result.data.url;
    link.download = result.data.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleVectorize() {
    setIsVectorizing(true);
    setVectorActionError(null);
    const result = await vectorizeDesignAction({ id: design.id });
    setIsVectorizing(false);
    if (!result.ok) {
      setVectorActionError(result.error);
    } else {
      router.refresh();
    }
  }

  async function handleDownloadVector() {
    setIsDownloadingVector(true);
    setVectorActionError(null);
    const result = await getVectorizationDownloadUrlAction({ id: design.id });
    setIsDownloadingVector(false);
    if (!result.ok) {
      setVectorActionError(result.error);
      return;
    }
    const link = document.createElement("a");
    link.href = result.data.url;
    link.download = result.data.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleDeleteVector() {
    setIsDeletingVector(true);
    setVectorActionError(null);
    const result = await deleteVectorizationAction({ id: design.id });
    setIsDeletingVector(false);
    if (!result.ok) {
      setVectorActionError(result.error);
    } else {
      router.refresh();
    }
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative aspect-square bg-muted/50">
        {design.status === "generating" ? (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-label="Generating" />
          </div>
        ) : (
          <ImagePreview url={displayUrl} title={design.title} />
        )}
        <Badge variant={statusMeta?.badgeVariant ?? "outline"} className="absolute top-2 left-2">
          {designStatusLabel(design.status)}
        </Badge>
        <Badge variant="outline" className="absolute top-2 right-2 bg-card/90">
          #{design.variation_index + 1}
        </Badge>
        {/* Only badge real images — the mock preview already bakes its own
            "MOCK PREVIEW — NOT AI-GENERATED" ribbon into the artwork
            itself (see MockImageProvider), so a second badge in the same
            corner would just duplicate and visually collide with it. */}
        {isRealAsset && (
          <Badge variant="accent" className="absolute bottom-2 left-2">
            <Sparkles className="size-3" />
            AI Generated
          </Badge>
        )}
        {vectorization?.status === "completed" && (
          <Badge variant="success" className="absolute bottom-2 right-2">
            <Shapes className="size-3" />
            Vector Ready
          </Badge>
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-1 text-sm font-medium">{design.title}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Variation #{design.variation_index + 1}</span>
          <span>{formatDate(design.created_at)}</span>
        </div>
        {actionError && <p className="text-xs text-destructive">{actionError}</p>}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Eye className="size-3.5" />
                View
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{design.title}</DialogTitle>
                <DialogDescription>
                  {isRealAsset
                    ? `AI Generated — a real image from the ${design.provider} provider.`
                    : "Development Preview — mock generation, not a real AI-generated design."}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 flex flex-col gap-4">
                <div className="aspect-square overflow-hidden rounded-xl border border-border bg-muted/50">
                  {design.status === "generating" ? (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Loader2 className="size-6 animate-spin" aria-label="Generating" />
                    </div>
                  ) : (
                    <ImagePreview url={displayUrl} title={design.title} />
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Status</dt>
                    <dd className="mt-0.5">{designStatusLabel(design.status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Variation</dt>
                    <dd className="mt-0.5">#{design.variation_index + 1}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Provider</dt>
                    <dd className="mt-0.5">
                      {design.provider}
                      {design.provider === "mock" ? " (mock)" : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Created</dt>
                    <dd className="mt-0.5">{formatDate(design.created_at)}</dd>
                  </div>
                  {projectName && (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Product</dt>
                      <dd className="mt-0.5">{projectName}</dd>
                    </div>
                  )}
                </dl>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">Prompt</p>
                  <p className="mt-1 max-h-32 overflow-y-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                    {design.prompt}
                  </p>
                </div>
                {design.negative_prompt && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Negative prompt</p>
                    <p className="mt-1 max-h-24 overflow-y-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap">
                      {design.negative_prompt}
                    </p>
                  </div>
                )}
                {isFailed && design.error_message && (
                  <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive" role="alert">
                    {design.error_message}
                  </p>
                )}
                {actionError && (
                  <p className="text-xs text-destructive" role="alert">
                    {actionError}
                  </p>
                )}

                {isRealAsset && (
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">Vector (SVG)</p>
                      {vectorization && (
                        <Badge variant={vectorizationStatusMeta[vectorization.status as VectorizationStatus]?.badgeVariant ?? "outline"}>
                          {vectorizationStatusLabel(vectorization.status)}
                        </Badge>
                      )}
                    </div>

                    {!vectorization && (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          Convert this design into cutting-machine-ready vector geometry.
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={handleVectorize} disabled={isVectorizing}>
                          {isVectorizing ? <Loader2 className="size-3.5 animate-spin" /> : <Shapes className="size-3.5" />}
                          Vectorize
                        </Button>
                      </div>
                    )}

                    {(vectorization?.status === "processing" || vectorization?.status === "queued") && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        Vectorizing…
                      </p>
                    )}

                    {vectorization?.status === "failed" && (
                      <div className="mt-2 space-y-2">
                        {vectorization.error_message && (
                          <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive" role="alert">
                            {vectorization.error_message}
                          </p>
                        )}
                        <Button type="button" variant="outline" size="sm" onClick={handleVectorize} disabled={isVectorizing}>
                          {isVectorizing ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                          Retry Vectorization
                        </Button>
                      </div>
                    )}

                    {vectorization?.status === "completed" && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {vectorization.provider === "mock"
                            ? "Development Vector Preview — deterministic placeholder geometry, not a real vectorization of the source image."
                            : `Real vector output from the ${vectorization.provider} provider.`}
                        </p>
                        <div className="aspect-square w-32 overflow-hidden rounded-lg border border-border bg-[conic-gradient(#f3f4f6_25%,#e5e7eb_0_50%,#f3f4f6_0_75%,#e5e7eb_0)] bg-[length:16px_16px]">
                          <ImagePreview url={vectorPreviewUrl ?? null} title={`${design.title} — vector`} />
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <div>Shapes: {vectorization.shape_count ?? "—"}</div>
                          <div>Paths: {vectorization.path_count ?? "—"}</div>
                          <div>Colors: {vectorization.color_count ?? "—"}</div>
                          <div>Size: {formatBytes(vectorization.file_size_bytes)}</div>
                        </dl>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={handleDownloadVector} disabled={isDownloadingVector}>
                            {isDownloadingVector ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                            Download SVG
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={handleDeleteVector} disabled={isDeletingVector}>
                            {isDeletingVector ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                            Remove
                          </Button>
                        </div>
                      </div>
                    )}

                    {vectorActionError && (
                      <p className="mt-2 text-xs text-destructive" role="alert">
                        {vectorActionError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                {isFailed && (
                  <Button type="button" variant="outline" onClick={handleRetry} disabled={isRetrying}>
                    {isRetrying && <Loader2 className="size-4 animate-spin" />}
                    <RotateCcw className="size-3.5" />
                    Retry
                  </Button>
                )}
                {!isFailed && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="opacity-70"
                    title="Regenerating a completed design arrives in a later phase"
                  >
                    <RotateCcw className="size-3.5" />
                    Regenerate
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={isRealAsset ? handleDownload : undefined}
                  disabled={!isRealAsset || isDownloading}
                  className={isRealAsset ? undefined : "opacity-70"}
                  title={isRealAsset ? undefined : "Downloads are available for real AI-generated designs only — this is a mock preview"}
                >
                  {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-3.5" />}
                  Download Original
                </Button>
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting && <Loader2 className="size-4 animate-spin" />}
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isFailed && (
            <Button type="button" variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
