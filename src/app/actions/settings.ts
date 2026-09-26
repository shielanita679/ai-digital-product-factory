"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import { profileSettingsSchema } from "@/lib/validations/settings";
import { friendlyDbErrorMessage } from "@/lib/supabase/db-error";

export type UpdateProfileSettingsResult = { ok: true } | { ok: false; error: string };

/**
 * Updates only the four safe, self-service profile fields. `role`/`id`/
 * `email` are never in profileSettingsSchema's shape, so they can't reach
 * this function's `.update(...)` payload even if a caller smuggled them
 * into `input` — and the database itself additionally refuses to let the
 * `authenticated` role write the `role` column at all regardless (see the
 * Phase 12 migration's column-grant fix), so this is defense in depth,
 * not the only guard against self-escalation.
 */
export async function updateProfileSettingsAction(input: unknown): Promise<UpdateProfileSettingsResult> {
  const parsed = profileSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      sells_what: parsed.data.sellsWhat,
      sells_where: parsed.data.sellsWhere,
      monthly_product_volume: parsed.data.monthlyVolume,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: friendlyDbErrorMessage(error, "Could not save your changes. Please try again.") };
  }

  revalidatePath("/dashboard/settings/profile");
  return { ok: true };
}
