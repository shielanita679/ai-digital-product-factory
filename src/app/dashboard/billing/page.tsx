import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DatabaseZap } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { BillingPlans } from "@/components/billing/billing-plans";
import { SubscriptionStatusCard } from "@/components/billing/subscription-status-card";
import { CreditHistory } from "@/components/billing/credit-history";
import { createClient } from "@/lib/supabase/server";
import { isMigrationNotAppliedError } from "@/lib/supabase/db-error";
import { getBillingState } from "@/lib/billing/billing-service";
import { getCreditAccount, listLedgerEntries } from "@/lib/credits/credit-service";
import { isStripeAvailable } from "@/lib/stripe/stripe-service";
import { plans, getStripePriceId, PURCHASABLE_PLAN_VALUES, type PlanId } from "@/config/plans";

export const metadata: Metadata = {
  title: "Billing",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Probed directly so this page can distinguish "migration not applied
  // yet" from "genuinely no subscription" — same pattern used by every
  // Phase 6+ page for a not-yet-applied migration.
  const { error: probeError } = await supabase.from("credit_accounts").select("user_id").limit(1);
  if (isMigrationNotAppliedError(probeError)) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={DatabaseZap}
          title="Billing isn't set up yet"
          description="The database migration for billing and credits hasn't been applied to this project yet."
        />
      </div>
    );
  }

  const [billingState, creditAccount, ledgerEntries] = await Promise.all([
    getBillingState({ supabase, userId: user.id }),
    getCreditAccount({ supabase, userId: user.id }),
    listLedgerEntries({ supabase, userId: user.id }, 25),
  ]);

  const stripeConfigured = isStripeAvailable();
  const priceConfiguredByPlanId: Partial<Record<PlanId, boolean>> = Object.fromEntries(
    PURCHASABLE_PLAN_VALUES.map((id) => [id, !!getStripePriceId(id)]),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your plan, credit balance, and usage history.</p>
      </div>

      {checkout === "success" && (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Checkout complete. Your subscription and credits will appear here as soon as Stripe confirms payment — this can take a few seconds.
        </p>
      )}
      {checkout === "cancelled" && (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">Checkout was cancelled — no changes were made.</p>
      )}

      {!stripeConfigured && (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Billing is not configured in this environment. Plan changes and payment are unavailable, but your credit balance and history below are still accurate.
        </p>
      )}

      <SubscriptionStatusCard billingState={billingState} creditBalance={creditAccount?.balance ?? 0} stripeConfigured={stripeConfigured} />

      <BillingPlans
        plans={plans}
        currentPlanId={billingState.planId}
        isEntitled={billingState.isEntitled}
        stripeConfigured={stripeConfigured}
        priceConfiguredByPlanId={priceConfiguredByPlanId}
      />

      <CreditHistory entries={ledgerEntries} />
    </div>
  );
}
