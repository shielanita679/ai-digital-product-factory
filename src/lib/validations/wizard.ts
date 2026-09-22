import { z } from "zod";

import { PRODUCT_TYPE_VALUES } from "@/config/product-types";
import { STYLE_VALUES } from "@/config/styles";
import { AUDIENCE_VALUES } from "@/config/audiences";
import {
  CONTENT_MODE_VALUES,
  COLOR_MODE_VALUES,
  ORIENTATION_VALUES,
  DETAIL_LEVEL_VALUES,
} from "@/config/design-options";

export const MAX_PROMPT_LENGTH = 500;
export const MIN_PROMPT_LENGTH = 10;

export const promptSchema = z
  .string()
  .trim()
  .min(MIN_PROMPT_LENGTH, `Describe your idea in at least ${MIN_PROMPT_LENGTH} characters`)
  .max(MAX_PROMPT_LENGTH, `Keep it under ${MAX_PROMPT_LENGTH} characters`);

const wizardConfigShape = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name must be 80 characters or fewer"),
  prompt: promptSchema,
  productType: z.enum(PRODUCT_TYPE_VALUES, { message: "Choose a product type" }),
  styles: z.array(z.enum(STYLE_VALUES)).max(STYLE_VALUES.length),
  customStyle: z.string().trim().max(200, "Keep it under 200 characters").optional().default(""),
  audiences: z.array(z.enum(AUDIENCE_VALUES)).max(AUDIENCE_VALUES.length),
  customAudience: z.string().trim().max(200, "Keep it under 200 characters").optional().default(""),
  designCount: z.number().int().min(1).max(30),
  contentMode: z.enum(CONTENT_MODE_VALUES, { message: "Choose a content mode" }),
  colorMode: z.enum(COLOR_MODE_VALUES, { message: "Choose a color preference" }),
  customColors: z.string().trim().max(200, "Keep it under 200 characters").optional().default(""),
  transparentBackground: z.boolean(),
  orientation: z.enum(ORIENTATION_VALUES, { message: "Choose an orientation" }),
  detailLevel: z.enum(DETAIL_LEVEL_VALUES, { message: "Choose a detail level" }),
});

export const wizardConfigSchema = wizardConfigShape
  .refine((data) => data.styles.length > 0 || data.customStyle.trim().length > 0, {
    message: "Choose at least one style or describe a custom one",
    path: ["styles"],
  })
  .refine((data) => data.colorMode !== "custom" || data.customColors.trim().length > 0, {
    message: "Describe the colors you want",
    path: ["customColors"],
  })
  .refine((data) => data.productType !== "single_svg" || data.designCount === 1, {
    message: "Single SVG always creates exactly 1 design",
    path: ["designCount"],
  });

export type WizardConfigValues = z.infer<typeof wizardConfigSchema>;
