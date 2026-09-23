"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Trash2,
  Sparkles,
  Download,
  RotateCcw,
  ImageOff,
  Layers,
  Image as ImageIcon,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/dashboard/empty-state";
import { setBundleItemAction, removeBundleItemAction, generateBundleCoverAction, deleteBundleAction, renameBundleAction } from "@/app/actions/bundles";
import { generateMockupsAction, deleteMockupAction, getMockupDownloadUrlAction } from "@/app/actions/mockups";
import { bundleStatusMeta, bundleStatusLabel, mockupStatusMeta, mockupStatusLabel, mockupTemplateOptions } from "@/config/bundles";
import type { Project, ProductBundle, Design, BundleItem, Mockup } from "@/types/supabase";
import type { MockupTemplateType } from "@/lib/mockups/mockup-provider";

function Thumb({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!url || failed) {
    return (
      <div className="flex size-full items-center justify-center bg-muted/50 text-muted-foreground">
        <ImageOff className="size-4" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs / data URIs, not a fixed remote asset
  return <img src={url} alt={title} className="size-full object-contain" onError={() => setFailed(true)} />;
}

type Eligibility = { pngEligible: boolean; svgEligible: boolean };

function DesignRow({
  design,
  displayUrl,
  item,
  eligibility,
  bundleId,
  onChanged,
  mockups,
  mockupDisplayUrlById,
}: {
  design: Design;
  displayUrl: string | null;
  item: BundleItem | undefined;
  eligibility: Eligibility;
  bundleId: string;
  onChanged: () => void;
  mockups: Mockup[];
  mockupDisplayUrlById: Map<string, string | null>;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showMockups, setShowMockups] = React.useState(false);
  const [generatingTemplates, setGeneratingTemplates] = React.useState<Set<MockupTemplateType>>(new Set());

  const includePng = item?.include_png ?? false;
  const includeSvg = item?.include_svg ?? false;
  const isSelected = includePng || includeSvg;

  async function applyFormats(nextPng: boolean, nextSvg: boolean) {
    setPending(true);
    setError(null);
    const result =
      !nextPng && !nextSvg
        ? await removeBundleItemAction({ bundleId, designId: design.id })
        : await setBundleItemAction({ bundleId, designId: design.id, includePng: nextPng, includeSvg: nextSvg });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function handleGenerateMockup(templateType: MockupTemplateType) {
    setGeneratingTemplates((prev) => new Set(prev).add(templateType));
    setError(null);
    const result = await generateMockupsAction({ bundleId, designId: design.id, templateTypes: [templateType] });
    setGeneratingTemplates((prev) => {
      const next = new Set(prev);
      next.delete(templateType);
      return next;
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function handleRemoveMockup(mockupId: string) {
    setError(null);
    const result = await deleteMockupAction({ id: mockupId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function handleDownloadMockup(mockupId: string) {
    setError(null);
    const result = await getMockupDownloadUrlAction({ id: mockupId });
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

  const mockupByTemplate = new Map(mockups.map((m) => [m.template_type, m]));

  return (
    <Card className={isSelected ? "border-primary/40" : undefined}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex gap-3">
          <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border">
            <Thumb url={displayUrl} title={design.title} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-medium">{design.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <label className="flex items-center gap-1.5 text-xs" title={eligibility.pngEligible ? undefined : "No real stored PNG for this design yet"}>
                <Checkbox
                  checked={includePng}
                  disabled={pending || !eligibility.pngEligible}
                  onCheckedChange={(checked) => applyFormats(checked === true, includeSvg)}
                />
                PNG
              </label>
              <label className="flex items-center gap-1.5 text-xs" title={eligibility.svgEligible ? undefined : "No completed vectorization for this design yet"}>
                <Checkbox
                  checked={includeSvg}
                  disabled={pending || !eligibility.svgEligible}
                  onCheckedChange={(checked) => applyFormats(includePng, checked === true)}
                />
                SVG
              </label>
              {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </div>
          </div>
          {isSelected && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowMockups((v) => !v)}>
              <Sparkles className="size-3.5" />
              Mockups
            </Button>
          )}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {isSelected && showMockups && (
          <div className="rounded-lg border border-border p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {mockupTemplateOptions.map((template) => {
                const mockup = mockupByTemplate.get(template.value);
                const isGenerating = generatingTemplates.has(template.value) || mockup?.status === "processing" || mockup?.status === "queued";
                const statusMeta = mockup ? mockupStatusMeta[mockup.status as keyof typeof mockupStatusMeta] : null;

                return (
                  <div key={template.value} className="flex flex-col gap-1.5 rounded-lg border border-border p-2">
                    <div className="aspect-square overflow-hidden rounded-md bg-muted/50">
                      {mockup?.status === "completed" ? (
                        <Thumb url={mockupDisplayUrlById.get(mockup.id) ?? null} title={template.label} />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium">{template.label}</p>
                    {statusMeta && (
                      <Badge variant={statusMeta.badgeVariant} className="w-fit text-[10px]">
                        {mockupStatusLabel(mockup!.status)}
                      </Badge>
                    )}
                    {mockup?.status === "failed" && mockup.error_message && (
                      <p className="line-clamp-2 text-[10px] text-destructive">{mockup.error_message}</p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        disabled={isGenerating}
                        onClick={() => handleGenerateMockup(template.value)}
                      >
                        {mockup?.status === "completed" ? <RotateCcw className="size-3" /> : <Sparkles className="size-3" />}
                        {mockup?.status === "completed" ? "Regenerate" : mockup?.status === "failed" ? "Retry" : "Generate"}
                      </Button>
                      {mockup?.status === "completed" && (
                        <>
                          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => handleDownloadMockup(mockup.id)}>
                            <Download className="size-3" />
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => handleRemoveMockup(mockup.id)}>
                            <Trash2 className="size-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Development Mockup — deterministic placeholder compositing, not a photorealistic real-provider preview.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BundleDetail({
  project,
  bundle,
  designs,
  bundleItems,
  mockups,
  displayUrlById,
  vectorizationByDesignId,
  mockupDisplayUrlById,
  coverUrl,
}: {
  project: Project;
  bundle: ProductBundle;
  designs: Design[];
  bundleItems: BundleItem[];
  mockups: Mockup[];
  displayUrlById: Map<string, string | null>;
  vectorizationByDesignId: Map<string, { status: string }>;
  mockupDisplayUrlById: Map<string, string | null>;
  coverUrl: string | null;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(bundle.name);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const statusMeta = bundleStatusMeta[bundle.status as keyof typeof bundleStatusMeta];

  const itemByDesignId = new Map(bundleItems.map((i) => [i.design_id, i]));
  const mockupsByDesignId = new Map<string, Mockup[]>();
  for (const m of mockups) {
    const list = mockupsByDesignId.get(m.design_id) ?? [];
    list.push(m);
    mockupsByDesignId.set(m.design_id, list);
  }

  function refresh() {
    router.refresh();
  }

  async function handleRename() {
    if (name.trim() === bundle.name || name.trim().length < 2) return;
    setIsRenaming(true);
    const result = await renameBundleAction({ id: bundle.id, name });
    setIsRenaming(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleGenerateCover() {
    setIsGeneratingCover(true);
    setError(null);
    const result = await generateBundleCoverAction({ id: bundle.id });
    setIsGeneratingCover(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleDeleteBundle() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteBundleAction({ id: bundle.id });
    setIsDeleting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/dashboard/products/${project.id}`);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href={`/dashboard/products/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {project.name}
      </Link>

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleRename}
              maxLength={80}
              className="max-w-sm text-xl font-semibold"
              aria-label="Bundle name"
            />
            {isRenaming && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <Badge variant={statusMeta?.badgeVariant ?? "outline"}>{bundleStatusLabel(bundle.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {bundle.item_count} design{bundle.item_count === 1 ? "" : "s"} selected · {bundle.mockup_count} mockup{bundle.mockup_count === 1 ? "" : "s"} ready
          </p>
        </div>
        <Button type="button" variant="outline" onClick={handleDeleteBundle} disabled={isDeleting}>
          {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete Bundle
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-border bg-muted/50 sm:w-64">
            {coverUrl ? <Thumb url={coverUrl} title="Bundle cover" /> : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <Layers className="size-6" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Bundle Cover</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {coverUrl
                ? "Development Bundle Cover — deterministic placeholder, not a real product photo."
                : "Generate a cover once you've selected some designs."}
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={handleGenerateCover} disabled={isGeneratingCover}>
              {isGeneratingCover ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {coverUrl ? "Regenerate Cover" : "Generate Cover"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <Label className="text-sm font-medium">Select designs and formats</Label>
        <p className="mt-1 text-sm text-muted-foreground">
          Only real, completed assets can be included. Unavailable formats are disabled.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          {designs.length > 0 ? (
            designs.map((design) => {
              const vectorization = vectorizationByDesignId.get(design.id);
              const eligibility: Eligibility = {
                pngEligible: design.status === "completed" && !!design.storage_path,
                svgEligible: vectorization?.status === "completed",
              };
              return (
                <DesignRow
                  key={design.id}
                  design={design}
                  displayUrl={displayUrlById.get(design.id) ?? null}
                  item={itemByDesignId.get(design.id)}
                  eligibility={eligibility}
                  bundleId={bundle.id}
                  onChanged={refresh}
                  mockups={mockupsByDesignId.get(design.id) ?? []}
                  mockupDisplayUrlById={mockupDisplayUrlById}
                />
              );
            })
          ) : (
            <EmptyState icon={Layers} title="No designs in this product yet" description="Generate designs from the product page first." compact />
          )}
        </div>
      </div>
    </div>
  );
}
