import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";

import type { Database } from "@/types/supabase";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { getTextProvider } from "@/lib/ai/text-provider-registry";
import type { TextProvider } from "@/lib/ai/text-provider";
import { getMarketplaceLimits, type MarketplaceId } from "@/config/marketplaces";
import { productTypeLabel } from "@/config/product-types";
import { styleOptions } from "@/config/styles";
import { audienceOptions } from "@/config/audiences";
import { labelFor } from "@/config/design-options";
import {
  buildGeneratedTitleSchema,
  buildGeneratedDescriptionSchema,
  buildGeneratedTagsSchema,
  buildGeneratedKeywordsSchema,
} from "@/lib/validations/listing";

export type ListingGenerationContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type ListingGenerationServiceErrorCode =
  | "not_found"
  | "invalid_config"
  | "provider_error"
  | "invalid_output"
  | "db_error"
  | "migration_not_applied";

export class ListingGenerationServiceError extends Error {
  readonly code: ListingGenerationServiceErrorCode;
  constructor(message: string, code: ListingGenerationServiceErrorCode) {
    super(message);
    this.name = "ListingGenerationServiceError";
    this.code = code;
  }
}

export type GeneratedListingContent = {
  title: string;
  description: string;
  tags: string[];
  seoKeywords: string[];
  includedFiles: string[];
  materials: string[];
  providerName: string;
};

type BundleContextData = {
  bundleName: string;
  productTypeLabel: string;
  originalIdea: string;
  styles: string[];
  targetAudience: string[];
  designCount: number;
  designTitles: string[];
  includesPng: boolean;
  includesSvg: boolean;
};

/**
 * Loads everything the generator needs directly from the database, scoped
 * by the caller's own user_id on every query (RLS-governed, not trusted
 * client input) — the project's original idea/style/audience/product type,
 * the bundle's name, and the REAL selected bundle_items (never a
 * client-supplied "these are the formats" claim) to compute designCount/
 * includesPng/includesSvg honestly. Mirrors loadOwnedBundle/
 * loadOwnedProject in bundle-service.ts.
 */
async function loadBundleContext(ctx: ListingGenerationContext, bundleId: string): Promise<BundleContextData> {
  const { data: bundle, error: bundleError } = await ctx.supabase
    .from("product_bundles")
    .select("id, name, project_id")
    .eq("id", bundleId)
    .eq("user_id", ctx.userId)
    .single();
  if (bundleError || !bundle) {
    if (isMigrationNotAppliedError(bundleError)) {
      throw new ListingGenerationServiceError(friendlyDbErrorMessage(bundleError, "Could not load the bundle."), "migration_not_applied");
    }
    throw new ListingGenerationServiceError("Bundle not found.", "not_found");
  }

  const { data: project, error: projectError } = await ctx.supabase
    .from("projects")
    .select("*")
    .eq("id", bundle.project_id)
    .eq("user_id", ctx.userId)
    .single();
  if (projectError || !project) {
    throw new ListingGenerationServiceError("Product not found.", "not_found");
  }

  const { data: items } = await ctx.supabase
    .from("bundle_items")
    .select("include_png, include_svg, designs(title)")
    .eq("bundle_id", bundleId)
    .eq("user_id", ctx.userId);

  const rows = items ?? [];
  const styles = (project.style ?? []).map((v) => labelFor(styleOptions, v));
  if (project.custom_style?.trim()) styles.push(project.custom_style.trim());
  const targetAudience = (project.target_audience ?? []).map((v) => labelFor(audienceOptions, v));
  if (project.custom_audience?.trim()) targetAudience.push(project.custom_audience.trim());

  const designTitles = rows
    .map((r) => (r.designs as unknown as { title: string } | null)?.title)
    .filter((t): t is string => !!t)
    .slice(0, 5);

  return {
    bundleName: bundle.name,
    productTypeLabel: productTypeLabel(project.product_type),
    originalIdea: project.user_prompt ?? "",
    styles,
    targetAudience,
    designCount: rows.length,
    designTitles,
    includesPng: rows.some((r) => r.include_png),
    includesSvg: rows.some((r) => r.include_svg),
  };
}

function buildIncludedFiles(includesPng: boolean, includesSvg: boolean): string[] {
  return [includesPng ? "PNG" : null, includesSvg ? "SVG" : null].filter((f): f is string => !!f);
}

function buildMaterials(includesPng: boolean, includesSvg: boolean): string[] {
  return ["Digital file", includesPng ? "PNG file" : null, includesSvg ? "SVG file" : null].filter((m): m is string => !!m);
}

function wrapZod<T>(fn: () => T, fieldLabel: string): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ListingGenerationServiceError(`Generated ${fieldLabel} failed validation: ${err.issues[0]?.message ?? "invalid output"}`, "invalid_output");
    }
    throw err;
  }
}

export type GenerateListingContentOptions = {
  /** Test-only escape hatch. Never set from the "Generate Listing" Server Action. */
  providerOverride?: TextProvider;
};

type ListingTask = "listing_title" | "listing_description" | "listing_tags" | "listing_keywords";

async function resolveProvider(options: GenerateListingContentOptions): Promise<TextProvider> {
  try {
    return options.providerOverride ?? getTextProvider();
  } catch (err) {
    throw new ListingGenerationServiceError(err instanceof Error ? err.message : "Unsupported text provider configured.", "provider_error");
  }
}

async function buildGenerationBasis(ctx: ListingGenerationContext, bundleId: string, marketplace: MarketplaceId) {
  const context = await loadBundleContext(ctx, bundleId);
  const limits = getMarketplaceLimits(marketplace);
  const baseContext = {
    marketplace,
    bundleId,
    bundleName: context.bundleName,
    productType: context.productTypeLabel,
    originalIdea: context.originalIdea,
    styles: context.styles,
    targetAudience: context.targetAudience,
    designCount: context.designCount,
    designTitles: context.designTitles,
    includesPng: context.includesPng,
    includesSvg: context.includesSvg,
    titleMaxLength: limits.titleMaxLength,
    descriptionMaxLength: limits.descriptionMaxLength,
    maxTags: limits.maxTags,
    tagMaxLength: limits.tagMaxLength,
    maxKeywords: limits.maxKeywords,
    keywordMaxLength: limits.keywordMaxLength,
  };
  return { context, limits, baseContext };
}

async function runTask(provider: TextProvider, baseContext: Record<string, unknown>, task: ListingTask, instruction: string): Promise<string> {
  const result = await provider.generateText({ instruction, context: { ...baseContext, task } });
  if (!result.ok) {
    throw new ListingGenerationServiceError(`Listing ${task.replace("listing_", "")} generation failed: ${result.errorMessage}`, "provider_error");
  }
  return result.text;
}

const TASK_INSTRUCTIONS: Record<ListingTask, string> = {
  listing_title: "Generate a concise, marketplace-friendly product listing title.",
  listing_description: "Generate a structured product listing description.",
  listing_tags: "Generate relevant, non-redundant listing tags.",
  listing_keywords: "Generate SEO keyword phrases for this listing.",
};

/**
 * context -> provider -> structured result. Never trusts provider output
 * directly: every field is Zod-validated/normalized against the
 * marketplace's own limits (src/config/marketplaces.ts) before being
 * returned. A provider failure on ANY field aborts the whole generation
 * (thrown as ListingGenerationServiceError) — the caller (ListingService)
 * is responsible for leaving any existing saved listing untouched when
 * this throws, never partially overwriting it.
 */
export async function generateListingContent(
  ctx: ListingGenerationContext,
  bundleId: string,
  marketplace: MarketplaceId,
  options: GenerateListingContentOptions = {},
): Promise<GeneratedListingContent> {
  const { context, limits, baseContext } = await buildGenerationBasis(ctx, bundleId, marketplace);
  const provider = await resolveProvider(options);

  const titleRaw = await runTask(provider, baseContext, "listing_title", TASK_INSTRUCTIONS.listing_title);
  const descriptionRaw = await runTask(provider, baseContext, "listing_description", TASK_INSTRUCTIONS.listing_description);
  const tagsRaw = await runTask(provider, baseContext, "listing_tags", TASK_INSTRUCTIONS.listing_tags);
  const keywordsRaw = await runTask(provider, baseContext, "listing_keywords", TASK_INSTRUCTIONS.listing_keywords);

  const title = wrapZod(() => buildGeneratedTitleSchema(limits).parse(titleRaw), "title");
  const description = wrapZod(() => buildGeneratedDescriptionSchema(limits).parse(descriptionRaw), "description");
  const tags = wrapZod(() => buildGeneratedTagsSchema(limits).parse(tagsRaw), "tags");
  const seoKeywords = wrapZod(() => buildGeneratedKeywordsSchema(limits).parse(keywordsRaw), "keywords");

  if (tags.length === 0) {
    throw new ListingGenerationServiceError("Generated tags were empty after validation.", "invalid_output");
  }

  return {
    title,
    description,
    tags,
    seoKeywords,
    includedFiles: buildIncludedFiles(context.includesPng, context.includesSvg),
    materials: buildMaterials(context.includesPng, context.includesSvg),
    providerName: provider.name,
  };
}

export type GeneratedListingSection =
  | { section: "title"; title: string }
  | { section: "description"; description: string }
  | { section: "tags"; tags: string[] }
  | { section: "keywords"; seoKeywords: string[] };

/**
 * Regenerates exactly one section — used by "Regenerate" on an individual
 * field so the other, possibly manually-edited, sections are never
 * touched. Same context-gathering and validation path as the full
 * generation, just for one field.
 */
export async function generateListingSection(
  ctx: ListingGenerationContext,
  bundleId: string,
  marketplace: MarketplaceId,
  section: "title" | "description" | "tags" | "keywords",
  options: GenerateListingContentOptions = {},
): Promise<GeneratedListingSection> {
  const { limits, baseContext } = await buildGenerationBasis(ctx, bundleId, marketplace);
  const provider = await resolveProvider(options);

  if (section === "title") {
    const raw = await runTask(provider, baseContext, "listing_title", TASK_INSTRUCTIONS.listing_title);
    return { section: "title", title: wrapZod(() => buildGeneratedTitleSchema(limits).parse(raw), "title") };
  }
  if (section === "description") {
    const raw = await runTask(provider, baseContext, "listing_description", TASK_INSTRUCTIONS.listing_description);
    return { section: "description", description: wrapZod(() => buildGeneratedDescriptionSchema(limits).parse(raw), "description") };
  }
  if (section === "tags") {
    const raw = await runTask(provider, baseContext, "listing_tags", TASK_INSTRUCTIONS.listing_tags);
    const tags = wrapZod(() => buildGeneratedTagsSchema(limits).parse(raw), "tags");
    if (tags.length === 0) throw new ListingGenerationServiceError("Generated tags were empty after validation.", "invalid_output");
    return { section: "tags", tags };
  }
  const raw = await runTask(provider, baseContext, "listing_keywords", TASK_INSTRUCTIONS.listing_keywords);
  return { section: "keywords", seoKeywords: wrapZod(() => buildGeneratedKeywordsSchema(limits).parse(raw), "keywords") };
}
