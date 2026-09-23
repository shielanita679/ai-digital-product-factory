import type { TextProvider, TextGenerationInput, TextGenerationResult } from "@/lib/ai/text-provider";

/**
 * Same avalanche-finalizer hash used independently by every other mock
 * provider in this codebase (mock-image-provider.ts, mock-vector-
 * provider.ts, mock-mockup-provider.ts, bundle-cover-service.ts) —
 * deliberate small duplication over cross-provider coupling, same
 * reasoning as those. `>>>` (unsigned right shift) throughout, per the
 * Phase 7 lesson: a signed `>>` on a hash forced unsigned via `>>> 0` can
 * go negative and produce an out-of-range array index.
 */
function hashString(input: string): number {
  let h = 0 ^ 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 2654435761);
  }
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length];
}

/** Listing-generation task hints this provider understands, via `context.task`. Anything else falls back to the original Phase 5 generic echo behavior. */
export type ListingTextTask = "listing_title" | "listing_description" | "listing_tags" | "listing_keywords";

type ListingContext = {
  task?: ListingTextTask;
  marketplace?: string;
  bundleId?: string;
  bundleName?: string;
  productType?: string;
  originalIdea?: string;
  styles?: string[];
  targetAudience?: string[];
  designCount?: number;
  designTitles?: string[];
  includesPng?: boolean;
  includesSvg?: boolean;
  titleMaxLength?: number;
  descriptionMaxLength?: number;
  maxTags?: number;
  tagMaxLength?: number;
  maxKeywords?: number;
  keywordMaxLength?: number;
};

function asListingContext(context: Record<string, unknown> | undefined): ListingContext {
  return (context ?? {}) as ListingContext;
}

function seedFor(ctx: ListingContext, salt: string): number {
  return hashString(`${ctx.bundleId ?? ""}:${ctx.marketplace ?? ""}:${salt}`);
}

const TITLE_HOOKS = ["Cute", "Modern", "Minimalist", "Bold", "Playful", "Charming", "Whimsical", "Elegant"] as const;
const TITLE_CLOSERS = ["Digital Download", "Instant Download Bundle", "Digital Art Pack", "Printable Set"] as const;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

function generateTitle(ctx: ListingContext): TextGenerationResult {
  const productType = ctx.productType?.trim() || "Digital Product";
  const bundleName = ctx.bundleName?.trim() || "Design Bundle";
  const designCount = ctx.designCount ?? 0;
  const hook = pick(TITLE_HOOKS, seedFor(ctx, "title-hook"));
  const closer = pick(TITLE_CLOSERS, seedFor(ctx, "title-closer"));
  const countPart = designCount > 0 ? `${designCount}-Design ` : "";

  const title = `${hook} ${bundleName} — ${countPart}${productType} ${closer}`.replace(/\s+/g, " ").trim();
  const maxLength = ctx.titleMaxLength ?? 140;
  return { ok: true, text: truncate(title, maxLength) };
}

const INTRO_OPENERS = [
  "Bring your next project to life with this",
  "Add instant charm to your creations with this",
  "Level up your projects with this",
  "Give your next idea a head start with this",
] as const;

function generateDescription(ctx: ListingContext): TextGenerationResult {
  const productType = ctx.productType?.trim() || "digital product";
  const bundleName = ctx.bundleName?.trim() || "design bundle";
  const originalIdea = ctx.originalIdea?.trim();
  const designCount = ctx.designCount ?? 0;
  const styles = (ctx.styles ?? []).filter(Boolean);
  const audience = (ctx.targetAudience ?? []).filter(Boolean);
  const includesPng = !!ctx.includesPng;
  const includesSvg = !!ctx.includesSvg;

  const opener = pick(INTRO_OPENERS, seedFor(ctx, "desc-opener"));
  const styleText = styles.length > 0 ? ` ${styles.join(", ")}-styled` : "";

  const intro = `${opener}${styleText} ${bundleName} ${productType}.${originalIdea ? ` ${originalIdea}.` : ""}`;

  const whatsIncludedLines = [
    designCount > 0 ? `- ${designCount} unique design${designCount === 1 ? "" : "s"}` : "- Selected designs from this bundle",
    includesPng ? "- High-resolution PNG files" : null,
    includesSvg ? "- Editable SVG vector files" : null,
  ].filter((l): l is string => !!l);

  const idealFor =
    audience.length > 0
      ? `Ideal for ${audience.join(", ")} looking for ready-to-use ${productType.toLowerCase()} designs.`
      : `Ideal for anyone looking for ready-to-use ${productType.toLowerCase()} designs.`;

  const formatsLine =
    includesPng && includesSvg
      ? "File formats: PNG and SVG."
      : includesPng
        ? "File formats: PNG."
        : includesSvg
          ? "File formats: SVG."
          : "File formats: see the bundle's included assets.";

  const sections = [
    intro,
    "",
    "WHAT'S INCLUDED",
    ...whatsIncludedLines,
    "",
    "IDEAL FOR",
    idealFor,
    "",
    "FILE FORMATS",
    formatsLine,
    "",
    "DIGITAL PRODUCT NOTICE",
    "This is a digital download — no physical item will be shipped. Files are delivered digitally after purchase.",
    "",
    "USAGE",
    "See the included license for permitted usage. A summary is provided with this listing; review the full license text before use.",
  ];

  const text = sections.join("\n").trim();
  const maxLength = ctx.descriptionMaxLength ?? 5000;
  return { ok: true, text: truncate(text, maxLength) };
}

const TAG_STYLE_WORDS = ["digital download", "clipart", "printable", "craft supply"] as const;

function generateTagList(ctx: ListingContext, count: number, maxLength: number, extraPool: readonly string[]): string[] {
  const productType = ctx.productType?.trim().toLowerCase() || "digital product";
  const styles = (ctx.styles ?? []).map((s) => s.toLowerCase()).filter(Boolean);
  const audience = (ctx.targetAudience ?? []).map((a) => a.toLowerCase()).filter(Boolean);

  const pool = [
    productType,
    ...styles,
    ...audience,
    ...extraPool,
    ctx.includesPng ? "png design" : null,
    ctx.includesPng ? "png" : null,
    ctx.includesSvg ? "svg design" : null,
    ctx.includesSvg ? "svg" : null,
    ctx.includesSvg ? "cricut" : null,
  ].filter((t): t is string => !!t);

  const seed = seedFor(ctx, `tags-${count}`);
  const ordered: string[] = [];
  for (let i = 0; i < pool.length && ordered.length < count; i++) {
    const candidate = pool[(seed + i) % pool.length];
    const trimmed = candidate.trim().slice(0, maxLength);
    if (trimmed && !ordered.includes(trimmed)) ordered.push(trimmed);
  }
  return ordered;
}

function generateTags(ctx: ListingContext): TextGenerationResult {
  const maxTags = ctx.maxTags ?? 13;
  const tagMaxLength = ctx.tagMaxLength ?? 20;
  const tags = generateTagList(ctx, maxTags, tagMaxLength, TAG_STYLE_WORDS);
  return { ok: true, text: tags.join(", ") };
}

const KEYWORD_PHRASE_SUFFIXES = ["instant download", "digital file", "print at home", "gift idea", "diy craft"] as const;

function generateKeywords(ctx: ListingContext): TextGenerationResult {
  const maxKeywords = ctx.maxKeywords ?? 13;
  const keywordMaxLength = ctx.keywordMaxLength ?? 20;
  const productType = ctx.productType?.trim().toLowerCase() || "digital product";

  const phrasePool = KEYWORD_PHRASE_SUFFIXES.map((suffix) => `${productType} ${suffix}`.slice(0, keywordMaxLength));
  const keywords = generateTagList(ctx, maxKeywords, keywordMaxLength, phrasePool);
  return { ok: true, text: keywords.join(", ") };
}

/**
 * Deterministic, offline stand-in for a future LLM-backed TextProvider.
 * Requires no API key and never touches the network.
 *
 * When `input.context.task` names one of the Phase 9 listing tasks
 * (`listing_title` / `listing_description` / `listing_tags` /
 * `listing_keywords`), this provider deterministically synthesizes
 * realistic-looking DEVELOPMENT listing text from the rest of the context
 * object — the same seed (bundleId + marketplace + task) always produces
 * the same output, so regeneration is reproducible and testable. Anything
 * else falls back to the original Phase 5 generic behavior (normalize
 * whitespace on the instruction), preserving backward compatibility for
 * any future non-listing caller of this same generic interface.
 */
export class MockTextProvider implements TextProvider {
  readonly name = "mock";

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    const ctx = asListingContext(input.context);

    switch (ctx.task) {
      case "listing_title":
        return generateTitle(ctx);
      case "listing_description":
        return generateDescription(ctx);
      case "listing_tags":
        return generateTags(ctx);
      case "listing_keywords":
        return generateKeywords(ctx);
      default: {
        const text = input.instruction.trim().replace(/\s+/g, " ");
        if (!text) {
          return { ok: false, errorMessage: "Instruction was empty." };
        }
        return { ok: true, text };
      }
    }
  }
}
