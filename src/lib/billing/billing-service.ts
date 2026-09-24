import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Subscription } from "@/types/supabase";
import { isMigrationNotAppliedError, friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import { isEntitledStatus } from "@/config/subscription";
import type { PlanId } from "@/config/plans";

export type BillingContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export class BillingServiceError extends Error {
  readonly code: "db_error" | "migration_not_applied";
  constructor(message: string, code: "db_error" | "migration_not_applied") {
    super(message);
    this.name = "BillingServiceError";
    this.code = code;
  }
}

export type BillingState = {
  subscription: Subscription | null;
  /** "free" when there's no subscription row at all — the absence of a row IS the free plan, never a seeded placeholder row. */
  planId: PlanId;
  isEntitled: boolean;
};

/** Read-only subscription/entitlement state — never mutates anything. All writes to `subscriptions` happen exclusively in WebhookService via the service-role client. */
export async function getBillingState(ctx: BillingContext): Promise<BillingState> {
  const { data, error } = await ctx.supabase.from("subscriptions").select("*").eq("user_id", ctx.userId).maybeSingle();
  if (error) {
    if (isMigrationNotAppliedError(error)) {
      return { subscription: null, planId: "free", isEntitled: false };
    }
    throw new BillingServiceError(friendlyDbErrorMessage(error, "Could not load your subscription."), "db_error");
  }
  if (!data) {
    return { subscription: null, planId: "free", isEntitled: false };
  }
  return {
    subscription: data,
    planId: data.plan_key as PlanId,
    isEntitled: isEntitledStatus(data.status),
  };
}
