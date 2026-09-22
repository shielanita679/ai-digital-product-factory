import { z } from "zod";

import { SELLS_WHAT_VALUES, SELLS_WHERE_VALUES, MONTHLY_VOLUME_VALUES } from "@/config/onboarding";

export const onboardingSchema = z.object({
  sellsWhat: z
    .array(z.enum(SELLS_WHAT_VALUES))
    .min(1, "Select at least one option"),
  sellsWhere: z
    .array(z.enum(SELLS_WHERE_VALUES))
    .min(1, "Select at least one option"),
  monthlyVolume: z.enum(MONTHLY_VOLUME_VALUES, {
    message: "Select how many products you create per month",
  }),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
