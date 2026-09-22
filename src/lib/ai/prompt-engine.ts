import type { ProductType } from "@/config/product-types";
import type { ContentMode, ColorMode, Orientation } from "@/config/design-options";
import { styleOptions } from "@/config/styles";
import { audienceOptions } from "@/config/audiences";
import { labelFor } from "@/config/design-options";
import { deriveProjectName } from "@/lib/derive-project-name";
import { normalizeDimensions, type NormalizedDimensions } from "@/lib/ai/image-provider";

export const PROMPT_ENGINE_VERSION = "v1";

/** Product types where the *point* of the product is a clean, cuttable/vectorizable shape. */
const VECTOR_ORIENTED_PRODUCT_TYPES: ReadonlySet<ProductType> = new Set([
  "svg_bundle",
  "single_svg",
  "sticker_pack",
  "laser_cut",
  "coloring_pages",
]);

const VECTOR_GUIDANCE_CLAUSE =
  "Clean, isolated composition with a strong silhouette and clean edges. Simple shapes, minimal unnecessary texture, and limited gradients so the artwork stays vector-friendly for future vectorization. Keep distinct elements clearly separated from one another.";

const VECTOR_NEGATIVE_PROMPT =
  "photorealistic background, excessive texture, complex gradients, tiny disconnected details, clutter, illegible typography, photographic lighting, busy scene";

// ---------------------------------------------------------------------------
// Deterministic variation word banks. Selection uses a mixed-radix "odometer"
// over the input index (see selectIllustrationVariation/selectTypographyVariation)
// so every combination up to the product of the bank lengths is unique —
// comfortably more than the largest requested_design_count (30) — with no
// randomness, so the same input always produces the same output.
// ---------------------------------------------------------------------------

const COMPOSITIONS = [
  { label: "Centered", clause: "centered and symmetrical" },
  { label: "Off-Center", clause: "off-center with dynamic negative space" },
  { label: "Framed", clause: "framed inside a simple decorative border" },
  { label: "Diagonal", clause: "arranged in a playful diagonal layout" },
  { label: "Airy", clause: "balanced with generous breathing room around the subject" },
  { label: "Bold Crop", clause: "tightly cropped for bold visual impact" },
];

const POSES = [
  { label: "At Rest", clause: "in a calm, resting pose" },
  { label: "In Motion", clause: "mid-action with energetic movement" },
  { label: "Curious Peek", clause: "peeking out with a curious expression" },
  { label: "Playful Pose", clause: "striking a playful, exaggerated pose" },
  { label: "Profile View", clause: "shown in profile with a confident stance" },
  { label: "Joyful Leap", clause: "captured mid-leap, full of joy" },
];

const SUPPORTING_ELEMENTS = [
  { label: "Light Accents", clause: "with a few small decorative accents nearby" },
  { label: "Minimal Shapes", clause: "surrounded by minimal complementary shapes" },
  { label: "Themed Prop", clause: "paired with one simple themed prop" },
  { label: "Flourish", clause: "accompanied by a subtle decorative flourish" },
  { label: "Understated", clause: "with understated, quiet supporting details" },
  { label: "Ornament", clause: "with light thematic ornamentation" },
];

const LAYOUTS = [
  { label: "Standalone", clause: "composed as a standalone focal illustration" },
  { label: "Badge Style", clause: "arranged for a clean badge-style layout" },
  { label: "Emblem", clause: "composed for a circular emblem feel" },
  { label: "Top-Down Flow", clause: "laid out with clear top-to-bottom visual flow" },
  { label: "Centered Hierarchy", clause: "designed with strong central hierarchy" },
  { label: "Hero Placement", clause: "composed for eye-catching hero placement" },
];

const TYPOGRAPHY_CONCEPTS = [
  { label: "Hand Lettering", clause: "bold, rounded hand-lettering" },
  { label: "Script Phrase", clause: "a playful script-style phrase" },
  { label: "Modern Sans", clause: "clean modern sans-serif lettering" },
  { label: "Stacked Lines", clause: "a stacked two-line typographic layout" },
  { label: "Banner Text", clause: "a curved banner-style text treatment" },
  { label: "Condensed Slogan", clause: "a punchy short slogan in condensed lettering" },
];

function odometerIndex(index: number, priorBankSizes: number[], bankSize: number): number {
  const divisor = priorBankSizes.reduce((acc, size) => acc * size, 1);
  return Math.floor(index / divisor) % bankSize;
}

function selectIllustrationVariation(index: number) {
  const composition = COMPOSITIONS[odometerIndex(index, [], COMPOSITIONS.length)];
  const pose = POSES[odometerIndex(index, [COMPOSITIONS.length], POSES.length)];
  const supporting =
    SUPPORTING_ELEMENTS[odometerIndex(index, [COMPOSITIONS.length, POSES.length], SUPPORTING_ELEMENTS.length)];
  const layout =
    LAYOUTS[
      odometerIndex(index, [COMPOSITIONS.length, POSES.length, SUPPORTING_ELEMENTS.length], LAYOUTS.length)
    ];
  return { composition, pose, supporting, layout };
}

function selectTypographyVariation(index: number) {
  const typography = TYPOGRAPHY_CONCEPTS[odometerIndex(index, [], TYPOGRAPHY_CONCEPTS.length)];
  const layout = LAYOUTS[odometerIndex(index, [TYPOGRAPHY_CONCEPTS.length], LAYOUTS.length)];
  return { typography, layout };
}

function buildStyleText(styles: string[], customStyle: string | null): string | null {
  const parts = [...styles.map((v) => labelFor(styleOptions, v)), customStyle?.trim()].filter(
    (v): v is string => Boolean(v),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildAudienceText(audiences: string[], customAudience: string | null): string | null {
  const parts = [...audiences.map((v) => labelFor(audienceOptions, v)), customAudience?.trim()].filter(
    (v): v is string => Boolean(v),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Never invents colors — only speaks up when the project actually specified some/a mode. */
function buildColorClause(colorMode: ColorMode, customColors: string[]): string | null {
  switch (colorMode) {
    case "monochrome":
      return "Rendered in a single-color monochrome palette with tonal variation only.";
    case "limited_palette":
      return "Rendered using a limited palette of 2-3 complementary colors.";
    case "full_color":
      return "Rendered in vibrant full color.";
    case "custom":
      return customColors.length > 0
        ? `Use this exact color palette only: ${customColors.join(", ")}.`
        : null;
    case "no_preference":
    default:
      return null;
  }
}

export type PromptEngineProjectInput = {
  id: string;
  userPrompt: string;
  productType: ProductType;
  styles: string[];
  customStyle: string | null;
  targetAudience: string[];
  customAudience: string | null;
  requestedDesignCount: number;
  contentMode: ContentMode;
  colorMode: ColorMode;
  customColors: string[];
  transparentBackground: boolean;
  orientation: Orientation;
  detailLevel: string;
};

export type DesignPrompt = {
  variationIndex: number;
  title: string;
  prompt: string;
  negativePrompt: string | null;
  dimensions: NormalizedDimensions;
  transparentBackground: boolean;
  promptEngineVersion: string;
};

const DETAIL_LEVEL_CLAUSE: Record<string, string> = {
  simple: "Bold, simplified shapes with minimal fine detail.",
  medium: "A balanced level of detail — clear but not overly intricate.",
  detailed: "Rich, intricate detail throughout.",
};

/**
 * Deterministic prompt-engine layer: turns one Phase 4 project configuration
 * into `requestedDesignCount` structured, distinct-but-related design
 * briefs. Pure function — no randomness, no I/O, no API keys required — so
 * the same project configuration always yields the same prompts.
 */
export function generateDesignPrompts(input: PromptEngineProjectInput): DesignPrompt[] {
  const count = input.productType === "single_svg" ? 1 : Math.max(1, Math.trunc(input.requestedDesignCount));
  const isVectorOriented = VECTOR_ORIENTED_PRODUCT_TYPES.has(input.productType);
  const styleText = buildStyleText(input.styles, input.customStyle);
  const audienceText = buildAudienceText(input.targetAudience, input.customAudience);
  const colorClause = buildColorClause(input.colorMode, input.customColors);
  const dimensions = normalizeDimensions(input.orientation);
  const theme = deriveProjectName(input.userPrompt);
  const detailClause = DETAIL_LEVEL_CLAUSE[input.detailLevel] ?? DETAIL_LEVEL_CLAUSE.medium;

  return Array.from({ length: count }, (_, variationIndex) => {
    const parts: string[] = [`${input.userPrompt.trim()}.`];
    let titleSuffix: string;

    // Title suffixes always combine two *decorrelated* odometer digits
    // (one that advances every index, one that only advances every
    // COMPOSITIONS.length/TYPOGRAPHY_CONCEPTS.length indices) so the
    // (fast, slow) pair stays unique for far more than the largest
    // possible requested_design_count (30), instead of two digits that
    // both happen to be `index % 6` and so repeat in lockstep every 6
    // designs — a real collision this file's own tests caught.
    if (input.contentMode === "text_only") {
      const { typography, layout } = selectTypographyVariation(variationIndex);
      parts.push(
        `Variation ${variationIndex + 1} of ${count}: typography-focused lettering design using ${typography.clause}, ${layout.clause}. A short phrase related to the idea above. Pure lettering artwork — no illustrated characters, objects, or scenery.`,
      );
      titleSuffix = `${typography.label} + ${layout.label}`;
    } else if (input.contentMode === "graphics_only") {
      const { composition, pose, supporting, layout } = selectIllustrationVariation(variationIndex);
      parts.push(
        `Variation ${variationIndex + 1} of ${count}: illustrated graphic, ${composition.clause}, subject ${pose.clause}, ${supporting.clause}, ${layout.clause}. Purely illustrative artwork — no text, letters, or words anywhere in the composition.`,
      );
      titleSuffix = `${composition.label} + ${pose.label}`;
    } else {
      const { composition, pose, supporting, layout } = selectIllustrationVariation(variationIndex);
      // Deliberately offset so this typography pick lands on a different
      // odometer digit than `composition` above (which is `index %
      // COMPOSITIONS.length`) — otherwise both are the same function of
      // `variationIndex` and every combination repeats every 6 designs.
      const { typography } = selectTypographyVariation(Math.floor(variationIndex / COMPOSITIONS.length));
      parts.push(
        `Variation ${variationIndex + 1} of ${count}: illustration ${composition.clause}, subject ${pose.clause}, ${supporting.clause}, ${layout.clause}, paired with ${typography.clause} spelling out a short related phrase.`,
      );
      titleSuffix = `${composition.label} + ${typography.label}`;
    }

    if (styleText) parts.push(`Style: ${styleText}.`);
    if (audienceText) parts.push(`Intended for: ${audienceText}.`);
    parts.push(detailClause);
    if (colorClause) parts.push(colorClause);
    if (input.transparentBackground) {
      parts.push(
        "Design should read clearly against a transparent or plain background — no busy scene behind the subject.",
      );
    }
    if (isVectorOriented) parts.push(VECTOR_GUIDANCE_CLAUSE);

    return {
      variationIndex,
      title: `${theme} — ${titleSuffix}`.slice(0, 80),
      prompt: parts.join(" "),
      negativePrompt: isVectorOriented ? VECTOR_NEGATIVE_PROMPT : null,
      dimensions,
      transparentBackground: input.transparentBackground,
      promptEngineVersion: PROMPT_ENGINE_VERSION,
    };
  });
}
