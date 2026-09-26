"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  RotateCcw,
  X,
  Plus,
  AlertTriangle,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  generateListingAction,
  regenerateListingSectionAction,
  updateListingAction,
  generateLicenseAction,
  updateLicenseTextAction,
  resetLicenseAction,
} from "@/app/actions/listings";
import {
  marketplaceOptions,
  getMarketplaceLimits,
  type MarketplaceId,
} from "@/config/marketplaces";
import { listingStatusMeta, listingStatusLabel } from "@/config/listings";
import { licenseTypeOptions, type LicenseType } from "@/config/licenses";
import type { ProductListing } from "@/types/supabase";
import type { ListingSection } from "@/lib/validations/listing";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function readEditedFlags(metadata: unknown): {
  titleEdited?: boolean;
  descriptionEdited?: boolean;
  tagsEdited?: boolean;
  keywordsEdited?: boolean;
} {
  return (metadata ?? {}) as {
    titleEdited?: boolean;
    descriptionEdited?: boolean;
    tagsEdited?: boolean;
    keywordsEdited?: boolean;
  };
}

/**
 * Postgres/PostgREST give no row-order guarantee without an explicit
 * ORDER BY (confirmed live: a later-created 'etsy' row sorted before an
 * earlier 'generic' one), so `listings[0]` is not a reliable default — it
 * could show a different marketplace tab on every page load. Always
 * prefer 'generic' (the schema's own default marketplace) when it
 * exists; only fall back to whatever IS present otherwise.
 */
export function pickDefaultMarketplace(listings: Pick<ProductListing, "marketplace">[]): MarketplaceId {
  return (listings.find((l) => l.marketplace === "generic")?.marketplace ?? listings[0]?.marketplace ?? "generic") as MarketplaceId;
}

function TagEditor({
  label,
  tags,
  onChange,
  maxTags,
  maxLength,
  disabled,
}: {
  label: string;
  tags: string[];
  onChange: (next: string[]) => void;
  maxTags: number;
  maxLength: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

  function addTag() {
    const trimmed = draft.trim().slice(0, maxLength);
    if (!trimmed) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    if (tags.length >= maxTags) return;
    onChange([...tags, trimmed]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {tags.length} / {maxTags}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              disabled={disabled}
              aria-label={`Remove ${tag}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      {tags.length < maxTags && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            maxLength={maxLength}
            placeholder={`Add a ${label.toLowerCase().replace(/s$/, "")}…`}
            disabled={disabled}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTag}
            disabled={disabled || !draft.trim()}
            aria-label={`Add ${label.toLowerCase().replace(/s$/, "")}`}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

type PendingConfirm =
  | { kind: "listing" }
  | { kind: "section"; section: ListingSection }
  | { kind: "license"; licenseType: LicenseType }
  | null;

/**
 * The license-type <select> updates `licenseType` optimistically as soon as
 * the user picks a value, before the server confirms it — so switching to a
 * type that requires overwrite confirmation and then dismissing that dialog
 * (Cancel, Escape, or backdrop click) must revert the displayed selection
 * back to the listing's actual persisted type. Otherwise the dropdown keeps
 * showing the cancelled choice even though nothing was saved. Returns the
 * value to restore, or null when the dismissal isn't a license-type change
 * (nothing to revert).
 */
export function licenseTypeToRestoreOnDismiss(
  pendingConfirm: PendingConfirm,
  persistedLicenseType: LicenseType | null | undefined,
): LicenseType | "" | null {
  if (pendingConfirm?.kind !== "license") return null;
  return (persistedLicenseType as LicenseType) ?? "";
}

export function ListingLicenseSection({
  bundleId,
  listings,
}: {
  bundleId: string;
  listings: ProductListing[];
}) {
  const [marketplace, setMarketplace] = React.useState<MarketplaceId>(pickDefaultMarketplace(listings));
  const listing = listings.find((l) => l.marketplace === marketplace) ?? null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Listing</p>
            <p className="text-xs text-muted-foreground">
              Generate marketplace-ready title, description, tags, and keywords.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value as MarketplaceId)}
              aria-label="Marketplace"
              className="h-8 w-32 text-xs"
            >
              {marketplaceOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
            {listing && (
              <Badge
                variant={
                  listingStatusMeta[
                    listing.status as keyof typeof listingStatusMeta
                  ]?.badgeVariant ?? "outline"
                }
              >
                {listingStatusLabel(listing.status)}
              </Badge>
            )}
          </div>
        </div>

        {/* Keyed on marketplace + listing id/updated_at so all local editable
            state (title/description/tags/keywords/license draft) resets
            cleanly on marketplace switch or after a save/regenerate,
            instead of syncing state from props inside an effect. */}
        <ListingBody
          key={`${marketplace}:${listing?.id ?? "none"}:${listing?.updated_at ?? ""}`}
          bundleId={bundleId}
          marketplace={marketplace}
          listing={listing}
        />
      </CardContent>
    </Card>
  );
}

function ListingBody({
  bundleId,
  marketplace,
  listing,
}: {
  bundleId: string;
  marketplace: MarketplaceId;
  listing: ProductListing | null;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [regeneratingSection, setRegeneratingSection] =
    React.useState<ListingSection | null>(null);
  const [pendingConfirm, setPendingConfirm] =
    React.useState<PendingConfirm>(null);

  const limits = getMarketplaceLimits(marketplace);

  const [title, setTitle] = React.useState(listing?.title ?? "");
  const [description, setDescription] = React.useState(
    listing?.description ?? "",
  );
  const [tags, setTags] = React.useState<string[]>(
    asStringArray(listing?.tags),
  );
  const [keywords, setKeywords] = React.useState<string[]>(
    asStringArray(listing?.seo_keywords),
  );
  const [isSaving, setIsSaving] = React.useState(false);

  const [licenseType, setLicenseType] = React.useState<LicenseType | "">(
    (listing?.license_type as LicenseType) ?? "",
  );
  const [licenseText, setLicenseText] = React.useState(
    listing?.license_text ?? "",
  );
  const [isSavingLicense, setIsSavingLicense] = React.useState(false);
  const [isGeneratingLicense, setIsGeneratingLicense] = React.useState(false);

  const flags = readEditedFlags(listing?.metadata);
  const titleDirty = title !== (listing?.title ?? "");
  const descriptionDirty = description !== (listing?.description ?? "");
  const tagsDirty =
    JSON.stringify(tags) !== JSON.stringify(asStringArray(listing?.tags));
  const keywordsDirty =
    JSON.stringify(keywords) !==
    JSON.stringify(asStringArray(listing?.seo_keywords));
  const anyDirty = titleDirty || descriptionDirty || tagsDirty || keywordsDirty;

  const licenseTextDirty = licenseText !== (listing?.license_text ?? "");

  function refresh() {
    router.refresh();
  }

  async function handleGenerateListing(confirmOverwriteEdits = false) {
    setIsGenerating(true);
    setError(null);
    const result = await generateListingAction({
      bundleId,
      marketplace,
      confirmOverwriteEdits,
    });
    setIsGenerating(false);
    if (!result.ok) {
      if ("code" in result && result.code === "edit_protected") {
        setPendingConfirm({ kind: "listing" });
        return;
      }
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleRegenerateSection(
    section: ListingSection,
    confirmOverwriteEdits = false,
  ) {
    if (!listing) return;
    setRegeneratingSection(section);
    setError(null);
    const result = await regenerateListingSectionAction({
      id: listing.id,
      section,
      confirmOverwriteEdits,
    });
    setRegeneratingSection(null);
    if (!result.ok) {
      if ("code" in result && result.code === "edit_protected") {
        setPendingConfirm({ kind: "section", section });
        return;
      }
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleSave() {
    if (!listing) return;
    setIsSaving(true);
    setError(null);
    const result = await updateListingAction({
      id: listing.id,
      title: titleDirty ? title : undefined,
      description: descriptionDirty ? description : undefined,
      tags: tagsDirty ? tags : undefined,
      seoKeywords: keywordsDirty ? keywords : undefined,
    });
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleGenerateLicense(
    type: LicenseType,
    confirmOverwriteEdits = false,
  ) {
    if (!listing) return;
    setIsGeneratingLicense(true);
    setError(null);
    const result = await generateLicenseAction({
      id: listing.id,
      licenseType: type,
      confirmOverwriteEdits,
    });
    setIsGeneratingLicense(false);
    if (!result.ok) {
      if ("code" in result && result.code === "edit_protected") {
        setPendingConfirm({ kind: "license", licenseType: type });
        return;
      }
      setLicenseType((listing.license_type as LicenseType) ?? "");
      setError(result.error);
      return;
    }
    refresh();
  }

  function closePendingConfirm() {
    const restore = licenseTypeToRestoreOnDismiss(
      pendingConfirm,
      listing?.license_type as LicenseType | null,
    );
    if (restore !== null) setLicenseType(restore);
    setPendingConfirm(null);
  }

  async function handleSaveLicenseText() {
    if (!listing) return;
    setIsSavingLicense(true);
    setError(null);
    const result = await updateLicenseTextAction({
      id: listing.id,
      licenseText,
    });
    setIsSavingLicense(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleResetLicense() {
    if (!listing) return;
    setIsGeneratingLicense(true);
    setError(null);
    const result = await resetLicenseAction({ id: listing.id });
    setIsGeneratingLicense(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  const isMockGenerated = listing?.generation_provider === "mock";

  return (
    <>
      {isMockGenerated && (
        <p className="text-[11px] text-muted-foreground">
          Development Listing Content — deterministic placeholder copy, not
          AI-generated.
        </p>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5" />
          {error}
        </p>
      )}

      {!listing && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No {marketplaceOptions.find((m) => m.value === marketplace)?.label}{" "}
            listing yet for this bundle.
          </p>
          <Button
            type="button"
            onClick={() => handleGenerateListing()}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Generate Listing
          </Button>
        </div>
      )}

      {listing && (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="listing-title">Title</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {title.length} / {limits.titleMaxLength}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px]"
                  disabled={regeneratingSection === "title"}
                  onClick={() => handleRegenerateSection("title")}
                >
                  {regeneratingSection === "title" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  Regenerate
                </Button>
              </div>
            </div>
            <Input
              id="listing-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={limits.titleMaxLength}
            />
            {flags.titleEdited && (
              <span className="text-[11px] text-muted-foreground">
                Manually edited
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="listing-description">Description</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {description.length} / {limits.descriptionMaxLength}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px]"
                  disabled={regeneratingSection === "description"}
                  onClick={() => handleRegenerateSection("description")}
                >
                  {regeneratingSection === "description" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  Regenerate
                </Button>
              </div>
            </div>
            <Textarea
              id="listing-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={limits.descriptionMaxLength}
              rows={8}
            />
            {flags.descriptionEdited && (
              <span className="text-[11px] text-muted-foreground">
                Manually edited
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px]"
                  disabled={regeneratingSection === "tags"}
                  onClick={() => handleRegenerateSection("tags")}
                >
                  {regeneratingSection === "tags" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  Regenerate
                </Button>
              </div>
              <TagEditor
                label="Tags"
                tags={tags}
                onChange={setTags}
                maxTags={limits.maxTags}
                maxLength={limits.tagMaxLength}
              />
              {flags.tagsEdited && (
                <span className="text-[11px] text-muted-foreground">
                  Manually edited
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[11px]"
                  disabled={regeneratingSection === "keywords"}
                  onClick={() => handleRegenerateSection("keywords")}
                >
                  {regeneratingSection === "keywords" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  Regenerate
                </Button>
              </div>
              <TagEditor
                label="SEO Keywords"
                tags={keywords}
                onChange={setKeywords}
                maxTags={limits.maxKeywords}
                maxLength={limits.keywordMaxLength}
              />
              {flags.keywordsEdited && (
                <span className="text-[11px] text-muted-foreground">
                  Manually edited
                </span>
              )}
            </div>
          </div>

          {(asStringArray(listing.included_files).length > 0 ||
            asStringArray(listing.materials).length > 0) && (
            <div className="rounded-lg border border-border p-3 text-xs">
              <p className="mb-1.5 font-medium">Product details</p>
              <p className="text-muted-foreground">
                Formats included:{" "}
                {asStringArray(listing.included_files).join(", ") || "—"}
                {" · "}Digital download
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={!anyDirty || isSaving}
            >
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save {anyDirty && "(unsaved changes)"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleGenerateListing()}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5" />
              )}
              Regenerate Listing
            </Button>
          </div>
        </>
      )}

      {listing && (
        <>
          <Separator />
          <div>
            <p className="text-sm font-medium">License</p>
            <p className="text-xs text-muted-foreground">
              Customizable template — not legal advice. Review and adjust these
              terms for your business and jurisdiction.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={licenseType}
              onChange={(e) => {
                const nextType = e.target.value as LicenseType;
                setLicenseType(nextType);
                handleGenerateLicense(nextType);
              }}
              aria-label="License type"
              className="h-9 w-56 text-sm"
              disabled={isGeneratingLicense}
            >
              <option value="" disabled>
                Select a license…
              </option>
              {licenseTypeOptions.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
            {listing.license_type && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetLicense}
                disabled={isGeneratingLicense}
              >
                {isGeneratingLicense ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Reset License Template
              </Button>
            )}
            {listing.license_edited && (
              <span className="text-[11px] text-muted-foreground">
                Manually edited
              </span>
            )}
          </div>

          {listing.license_type && (
            <div className="flex flex-col gap-1.5">
              <Textarea
                value={licenseText}
                onChange={(e) => setLicenseText(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
              <div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveLicenseText}
                  disabled={!licenseTextDirty || isSavingLicense}
                >
                  {isSavingLicense ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  Save License {licenseTextDirty && "(unsaved changes)"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={!!pendingConfirm}
        onOpenChange={(open) => !open && closePendingConfirm()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite manually edited content?</DialogTitle>
            <DialogDescription>
              {pendingConfirm?.kind === "listing" &&
                "This listing has manually edited sections. Regenerating will overwrite them."}
              {pendingConfirm?.kind === "section" &&
                `This ${pendingConfirm.section} has been manually edited. Regenerating will overwrite it.`}
              {pendingConfirm?.kind === "license" &&
                "This license has been manually edited. Generating a new template will overwrite it."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closePendingConfirm}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const confirm = pendingConfirm;
                setPendingConfirm(null);
                if (confirm?.kind === "listing") handleGenerateListing(true);
                if (confirm?.kind === "section")
                  handleRegenerateSection(confirm.section, true);
                if (confirm?.kind === "license")
                  handleGenerateLicense(confirm.licenseType, true);
              }}
            >
              Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
