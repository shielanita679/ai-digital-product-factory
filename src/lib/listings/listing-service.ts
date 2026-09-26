import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ProductListing, Json } from "@/types/supabase";

type ProductListingUpdate = Database["public"]["Tables"]["product_listings"]["Update"];
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import type { MarketplaceId } from "@/config/marketplaces";
import { getMarketplaceLimits } from "@/config/marketplaces";
import { generateListingContent, generateListingSection, ListingGenerationServiceError } from "@/lib/listings/listing-generation-service";
import { normalizeTagList, type ListingSection } from "@/lib/validations/listing";
import { AnalyticsService } from "@/lib/analytics/analytics-service";

export type ListingContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type ListingServiceErrorCode =
  | "not_found"
  | "invalid_config"
  | "edit_protected"
  | "generation_failed"
  | "db_error"
  | "migration_not_applied";

export class ListingServiceError extends Error {
  readonly code: ListingServiceErrorCode;
  constructor(message: string, code: ListingServiceErrorCode) {
    super(message);
    this.name = "ListingServiceError";
    this.code = code;
  }
}

type EditedFlags = { titleEdited?: boolean; descriptionEdited?: boolean; tagsEdited?: boolean; keywordsEdited?: boolean };

function readEditedFlags(metadata: unknown): EditedFlags {
  return (metadata ?? {}) as EditedFlags;
}

function anyEdited(flags: EditedFlags): boolean {
  return !!(flags.titleEdited || flags.descriptionEdited || flags.tagsEdited || flags.keywordsEdited);
}

async function loadOwnedBundleForListing(ctx: ListingContext, bundleId: string) {
  const { data, error } = await ctx.supabase.from("product_bundles").select("id, project_id").eq("id", bundleId).eq("user_id", ctx.userId).single();
  if (error || !data) {
    if (isMigrationNotAppliedError(error)) {
      throw new ListingServiceError(friendlyDbErrorMessage(error, "Could not load the bundle."), "migration_not_applied");
    }
    throw new ListingServiceError("Bundle not found.", "not_found");
  }
  return data;
}

export async function loadOwnedListing(ctx: ListingContext, listingId: string): Promise<ProductListing> {
  const { data, error } = await ctx.supabase.from("product_listings").select("*").eq("id", listingId).eq("user_id", ctx.userId).single();
  if (error || !data) {
    if (isMigrationNotAppliedError(error)) {
      throw new ListingServiceError(friendlyDbErrorMessage(error, "Could not load the listing."), "migration_not_applied");
    }
    throw new ListingServiceError("Listing not found.", "not_found");
  }
  return data;
}

export async function loadListingsForBundle(ctx: ListingContext, bundleId: string): Promise<ProductListing[]> {
  const { data, error } = await ctx.supabase.from("product_listings").select("*").eq("bundle_id", bundleId).eq("user_id", ctx.userId);
  if (error) {
    if (isMigrationNotAppliedError(error)) return [];
    throw new ListingServiceError(friendlyDbErrorMessage(error, "Could not load listings."), "db_error");
  }
  return data ?? [];
}

async function findExistingRow(ctx: ListingContext, bundleId: string, marketplace: MarketplaceId): Promise<ProductListing | null> {
  const { data } = await ctx.supabase
    .from("product_listings")
    .select("*")
    .eq("bundle_id", bundleId)
    .eq("marketplace", marketplace)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data ?? null;
}

export type GenerateListingOptions = {
  /** Required when an existing row already has manually-edited sections — the caller (Server Action) surfaces a confirmation prompt and retries with this set. */
  confirmOverwriteEdits?: boolean;
};

/**
 * Generates (first time) or regenerates (subsequent times) the FULL
 * listing for a bundle+marketplace. One canonical row per (bundle_id,
 * marketplace) — a regeneration updates that same row in place, never
 * inserting a duplicate. If the row already has any manually-edited
 * section and the caller didn't pass confirmOverwriteEdits, this throws
 * ("edit_protected") instead of silently discarding the user's edits — the
 * Server Action surfaces that as a confirmation prompt. A provider/
 * validation failure marks the row `status: 'failed'` with an
 * error_message WITHOUT touching any previously saved title/description/
 * tags/keywords — regeneration can never destroy a previously good listing.
 */
export async function generateListing(ctx: ListingContext, bundleId: string, marketplace: MarketplaceId, options: GenerateListingOptions = {}): Promise<{ listingId: string }> {
  const bundle = await loadOwnedBundleForListing(ctx, bundleId);
  const existing = await findExistingRow(ctx, bundleId, marketplace);

  if (existing && anyEdited(readEditedFlags(existing.metadata)) && !options.confirmOverwriteEdits) {
    throw new ListingServiceError(
      "This listing has manually edited sections. Regenerating will overwrite them — confirm to continue.",
      "edit_protected",
    );
  }

  try {
    const content = await generateListingContent(ctx, bundleId, marketplace);

    const payload = {
      user_id: ctx.userId,
      project_id: bundle.project_id,
      bundle_id: bundleId,
      marketplace,
      status: "generated" as const,
      title: content.title,
      description: content.description,
      tags: content.tags,
      seo_keywords: content.seoKeywords,
      included_files: content.includedFiles,
      materials: content.materials,
      generation_provider: content.providerName,
      generation_model: content.providerName,
      error_message: null,
      metadata: {},
    };

    if (existing) {
      const { error } = await ctx.supabase
        .from("product_listings")
        .update({ ...payload, generation_version: (existing.generation_version ?? 1) + 1 })
        .eq("id", existing.id)
        .eq("user_id", ctx.userId);
      if (error) throw new ListingServiceError(friendlyDbErrorMessage(error, "Could not save the generated listing."), "db_error");
      void AnalyticsService.track({ eventName: "listing_generated", userId: ctx.userId, projectId: bundle.project_id, metadata: { bundleId, marketplace } });
      return { listingId: existing.id };
    }

    const { data, error } = await ctx.supabase.from("product_listings").insert(payload).select().single();
    if (error || !data) {
      throw new ListingServiceError(
        friendlyDbErrorMessage(error, "Could not save the generated listing."),
        isMigrationNotAppliedError(error) ? "migration_not_applied" : "db_error",
      );
    }
    void AnalyticsService.track({ eventName: "listing_generated", userId: ctx.userId, projectId: bundle.project_id, metadata: { bundleId, marketplace } });
    return { listingId: data.id };
  } catch (err) {
    if (err instanceof ListingGenerationServiceError) {
      if (existing) {
        // Preserve the existing saved content — only status/error_message change.
        await ctx.supabase.from("product_listings").update({ status: "failed", error_message: err.message }).eq("id", existing.id).eq("user_id", ctx.userId);
        throw new ListingServiceError(err.message, "generation_failed");
      }
      const { error: insertError } = await ctx.supabase.from("product_listings").insert({
        user_id: ctx.userId,
        project_id: bundle.project_id,
        bundle_id: bundleId,
        marketplace,
        status: "failed",
        error_message: err.message,
      });
      if (insertError && !isMigrationNotAppliedError(insertError)) {
        throw new ListingServiceError(friendlyDbErrorMessage(insertError, "Could not record the generation failure."), "db_error");
      }
      throw new ListingServiceError(err.message, "generation_failed");
    }
    throw err;
  }
}

export type RegenerateSectionOptions = { confirmOverwriteEdits?: boolean };

/** Regenerates exactly one section, preserving every other (possibly edited) section untouched. */
export async function regenerateListingSection(
  ctx: ListingContext,
  listingId: string,
  section: ListingSection,
  options: RegenerateSectionOptions = {},
): Promise<void> {
  const listing = await loadOwnedListing(ctx, listingId);
  const flags = readEditedFlags(listing.metadata);
  const flagKey = `${section}Edited` as keyof EditedFlags;

  if (flags[flagKey] && !options.confirmOverwriteEdits) {
    throw new ListingServiceError(`This ${section} has been manually edited. Regenerating will overwrite it — confirm to continue.`, "edit_protected");
  }

  try {
    const result = await generateListingSection(ctx, listing.bundle_id, listing.marketplace as MarketplaceId, section);
    const nextFlags = { ...flags, [flagKey]: false };
    const update: ProductListingUpdate = { metadata: nextFlags as Json, status: anyEdited(nextFlags) ? "edited" : "generated", error_message: null };
    if (result.section === "title") update.title = result.title;
    if (result.section === "description") update.description = result.description;
    if (result.section === "tags") update.tags = result.tags;
    if (result.section === "keywords") update.seo_keywords = result.seoKeywords;

    const { error } = await ctx.supabase.from("product_listings").update(update).eq("id", listingId).eq("user_id", ctx.userId);
    if (error) throw new ListingServiceError(friendlyDbErrorMessage(error, "Could not save the regenerated section."), "db_error");
  } catch (err) {
    if (err instanceof ListingGenerationServiceError) {
      await ctx.supabase.from("product_listings").update({ status: "failed", error_message: err.message }).eq("id", listingId).eq("user_id", ctx.userId);
      throw new ListingServiceError(err.message, "generation_failed");
    }
    throw err;
  }
}

export type UpdateListingFields = {
  title?: string;
  description?: string;
  tags?: string[];
  seoKeywords?: string[];
};

/** Persists a manual edit. Marks exactly the touched fields as edited — untouched fields keep whatever edited/generated state they already had. */
export async function updateListing(ctx: ListingContext, listingId: string, fields: UpdateListingFields): Promise<void> {
  const listing = await loadOwnedListing(ctx, listingId);
  const limits = getMarketplaceLimits(listing.marketplace);
  const flags = readEditedFlags(listing.metadata);
  const update: ProductListingUpdate = {};

  if (fields.title !== undefined) {
    update.title = fields.title.trim();
    flags.titleEdited = true;
  }
  if (fields.description !== undefined) {
    update.description = fields.description.trim();
    flags.descriptionEdited = true;
  }
  if (fields.tags !== undefined) {
    update.tags = normalizeTagList(fields.tags.join(","), limits.maxTags, limits.tagMaxLength);
    flags.tagsEdited = true;
  }
  if (fields.seoKeywords !== undefined) {
    update.seo_keywords = normalizeTagList(fields.seoKeywords.join(","), limits.maxKeywords, limits.keywordMaxLength);
    flags.keywordsEdited = true;
  }

  if (Object.keys(update).length === 0) return;

  update.metadata = flags as Json;
  update.status = "edited";

  const { error } = await ctx.supabase.from("product_listings").update(update).eq("id", listingId).eq("user_id", ctx.userId);
  if (error) throw new ListingServiceError(friendlyDbErrorMessage(error, "Could not save your changes."), "db_error");
}
