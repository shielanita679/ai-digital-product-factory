/** Must match the `marketplace` check constraint in supabase/migrations. */
export const MARKETPLACE_VALUES = ["generic", "etsy"] as const;
export type MarketplaceId = (typeof MARKETPLACE_VALUES)[number];

export const marketplaceOptions: { value: MarketplaceId; label: string }[] = [
  { value: "generic", label: "Generic" },
  { value: "etsy", label: "Etsy" },
];

export function marketplaceLabel(marketplace: string): string {
  return marketplaceOptions.find((m) => m.value === marketplace)?.label ?? marketplace;
}

/**
 * Centralized per-marketplace limits — the single place these numbers live.
 * Nothing in a component or service should hard-code a "13 tags" / "20
 * chars" style constant directly; they import this config instead, so
 * adding a marketplace later (or Etsy changing a limit) is a one-file edit.
 *
 * The Etsy numbers below (13 tags, 20 chars/tag, 140-char title) mirror
 * Etsy's real, published listing limits as of this writing — used here only
 * to shape realistic development content and client-side validation, never
 * to talk to the real Etsy API (no Etsy integration exists in Phase 9).
 */
export type MarketplaceLimits = {
  titleMaxLength: number;
  descriptionMaxLength: number;
  maxTags: number;
  tagMaxLength: number;
  maxKeywords: number;
  keywordMaxLength: number;
};

export const marketplaceLimits: Record<MarketplaceId, MarketplaceLimits> = {
  generic: {
    titleMaxLength: 200,
    descriptionMaxLength: 5000,
    maxTags: 20,
    tagMaxLength: 30,
    maxKeywords: 20,
    keywordMaxLength: 50,
  },
  etsy: {
    titleMaxLength: 140,
    descriptionMaxLength: 5000,
    maxTags: 13,
    tagMaxLength: 20,
    maxKeywords: 13,
    keywordMaxLength: 20,
  },
};

export function getMarketplaceLimits(marketplace: string): MarketplaceLimits {
  return marketplaceLimits[marketplace as MarketplaceId] ?? marketplaceLimits.generic;
}
