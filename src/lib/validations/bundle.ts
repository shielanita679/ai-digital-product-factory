import { z } from "zod";

import { MOCKUP_TEMPLATE_VALUES } from "@/lib/mockups/mockup-provider";

const bundleName = z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name must be 80 characters or fewer");

export const createBundleSchema = z.object({
  projectId: z.string().uuid(),
  name: bundleName,
});

export const bundleIdSchema = z.object({
  id: z.string().uuid(),
});

export const renameBundleSchema = z.object({
  id: z.string().uuid(),
  name: bundleName,
});

export const setBundleItemSchema = z.object({
  bundleId: z.string().uuid(),
  designId: z.string().uuid(),
  includePng: z.boolean(),
  includeSvg: z.boolean(),
});

export const removeBundleItemSchema = z.object({
  bundleId: z.string().uuid(),
  designId: z.string().uuid(),
});

export const generateMockupsSchema = z.object({
  bundleId: z.string().uuid(),
  designId: z.string().uuid(),
  templateTypes: z.array(z.enum(MOCKUP_TEMPLATE_VALUES)).min(1, "Choose at least one mockup template"),
});

export const mockupIdSchema = z.object({
  id: z.string().uuid(),
});
