import { z } from "zod";

import { MARKETPLACE_VALUES, type MarketplaceLimits } from "@/config/marketplaces";
import { LICENSE_TYPE_VALUES } from "@/config/licenses";

export const LISTING_SECTION_VALUES = ["title", "description", "tags", "keywords"] as const;
export type ListingSection = (typeof LISTING_SECTION_VALUES)[number];

// ---------------------------------------------------------------------------
// Server Action input schemas
// ---------------------------------------------------------------------------

export const generateListingSchema = z.object({
  bundleId: z.string().uuid(),
  marketplace: z.enum(MARKETPLACE_VALUES).default("generic"),
  confirmOverwriteEdits: z.boolean().default(false),
});

export const listingIdSchema = z.object({
  id: z.string().uuid(),
});

export const regenerateSectionSchema = z.object({
  id: z.string().uuid(),
  section: z.enum(LISTING_SECTION_VALUES),
  confirmOverwriteEdits: z.boolean().default(false),
});

const tagArray = z.array(z.string().trim().min(1)).max(50);

export const updateListingSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "Title can't be empty.").optional(),
  description: z.string().trim().min(1, "Description can't be empty.").optional(),
  tags: tagArray.optional(),
  seoKeywords: tagArray.optional(),
});

export const generateLicenseSchema = z.object({
  id: z.string().uuid(),
  licenseType: z.enum(LICENSE_TYPE_VALUES),
  confirmOverwriteEdits: z.boolean().default(false),
});

export const updateLicenseTextSchema = z.object({
  id: z.string().uuid(),
  licenseText: z.string().trim().min(1, "License text can't be empty."),
});

export const resetLicenseSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Structured generated-content validation/normalization — never trust
// provider output directly. Limits are marketplace-dependent, so these
// schemas are built per-call from src/config/marketplaces.ts, the single
// source of truth for those numbers.
// ---------------------------------------------------------------------------

/** Collapses internal whitespace runs and trims — normalizes provider text before length-limit validation. */
function normalizeWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Splits a comma-separated provider string into a clean, deduped, length-capped tag/keyword list. Empty entries and duplicates (case-insensitive) are dropped, not rejected — this is normalization, not validation failure. */
export function normalizeTagList(raw: string, maxCount: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.trim().slice(0, maxLength);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= maxCount) break;
  }
  return result;
}

export function buildGeneratedTitleSchema(limits: MarketplaceLimits) {
  return z
    .string()
    .transform(normalizeWhitespace)
    .pipe(z.string().min(1, "Generated title was empty.").max(limits.titleMaxLength, `Title exceeds ${limits.titleMaxLength} characters.`));
}

export function buildGeneratedDescriptionSchema(limits: MarketplaceLimits) {
  return z
    .string()
    .transform(normalizeWhitespace)
    .pipe(z.string().min(1, "Generated description was empty.").max(limits.descriptionMaxLength, `Description exceeds ${limits.descriptionMaxLength} characters.`));
}

export function buildGeneratedTagsSchema(limits: MarketplaceLimits) {
  return z
    .string()
    .transform((raw) => normalizeTagList(raw, limits.maxTags, limits.tagMaxLength))
    .pipe(z.array(z.string().min(1)).max(limits.maxTags));
}

export function buildGeneratedKeywordsSchema(limits: MarketplaceLimits) {
  return z
    .string()
    .transform((raw) => normalizeTagList(raw, limits.maxKeywords, limits.keywordMaxLength))
    .pipe(z.array(z.string().min(1)).max(limits.maxKeywords));
}
