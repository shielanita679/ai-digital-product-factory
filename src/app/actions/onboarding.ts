"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import { onboardingSchema } from "@/lib/validations/onboarding";
import { AnalyticsService } from "@/lib/analytics/analytics-service";
import { friendlyDbErrorMessage } from "@/lib/supabase/db-error";

export type SaveOnboardingResult = { ok: true } | { ok: false; error: string };

export async function saveOnboardingAction(input: unknown): Promise<SaveOnboardingResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please complete all steps before continuing.",
    };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({
      sells_what: parsed.data.sellsWhat,
      sells_where: parsed.data.sellsWhere,
      monthly_product_volume: parsed.data.monthlyVolume,
      onboarding_completed: true,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: friendlyDbErrorMessage(error, "Could not save your answers. Please try again.") };
  }

  void AnalyticsService.track({ eventName: "onboarding_completed", userId: user.id });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
