import { z } from "zod";

import { SELLS_WHAT_VALUES, SELLS_WHERE_VALUES, MONTHLY_VOLUME_VALUES } from "@/config/onboarding";

/**
 * Deliberately mirrors onboardingSchema's shape (same underlying columns)
 * plus fullName — but is a SEPARATE schema, not a re-export, so Settings
 * and Onboarding can diverge independently. Neither this schema nor the
 * Server Action that uses it ever accepts `role`, `id`, or `email` — see
 * updateProfileSettingsAction's own comment for the defense-in-depth
 * column-grant backstop.
 */
export const profileSettingsSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  sellsWhat: z.array(z.enum(SELLS_WHAT_VALUES)).min(1, "Select at least one option"),
  sellsWhere: z.array(z.enum(SELLS_WHERE_VALUES)).min(1, "Select at least one option"),
  monthlyVolume: z.enum(MONTHLY_VOLUME_VALUES, {
    message: "Select how many products you create per month",
  }),
});

export type ProfileSettingsValues = z.infer<typeof profileSettingsSchema>;
