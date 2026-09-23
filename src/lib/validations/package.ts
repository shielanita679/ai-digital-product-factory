import { z } from "zod";

import { MARKETPLACE_VALUES } from "@/config/marketplaces";

export const buildPackageSchema = z.object({
  bundleId: z.string().uuid(),
  marketplace: z.enum(MARKETPLACE_VALUES).default("generic"),
});

export const packageIdSchema = z.object({
  id: z.string().uuid(),
});

export const checkPackagePrerequisitesSchema = z.object({
  bundleId: z.string().uuid(),
  marketplace: z.enum(MARKETPLACE_VALUES).default("generic"),
});
