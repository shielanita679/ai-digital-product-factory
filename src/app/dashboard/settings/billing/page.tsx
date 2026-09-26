import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { SubscriptionStatusCard } from "@/components/billing/subscription-status-card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isMigrationNotAppliedError } from "@/lib/supabase/db-error";
import { getBillingState } from "@/lib/billing/billing-service";
import { getCreditAccount } from "@/lib/credits/credit-service";
import { isStripeAvailable } from "@/lib/stripe/stripe-service";

export const metadata: Metadata = {
  title: "Billing Settings",
};

/**
 * Deliberately thin: all billing business logic (subscription state,
 * scheduled-cancellation detection, entitlement) lives in
 * getBillingState()/SubscriptionStatusCard, reused here as-is — never
 * duplicated. Full plan comparison and credit-ledger history remain on
 * the existing /dashboard/billing page, linked below.
 */
export default async function SettingsBillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error: probeError } = await supabase.from("credit_accounts").select("user_id").limit(1);
  if (isMigrationNotAppliedError(probeError)) {
    return <p className="text-sm text-muted-foreground">Billing isn&apos;t set up yet in this environment.</p>;
  }

  const [billingState, creditAccount] = await Promise.all([
    getBillingState({ supabase, userId: user.id }),
    getCreditAccount({ supabase, userId: user.id }),
  ]);

  return (
    <div className="space-y-4">
      <SubscriptionStatusCard
        billingState={billingState}
        creditBalance={creditAccount?.balance ?? 0}
        stripeConfigured={isStripeAvailable()}
      />
      <Button variant="outline" asChild>
        <Link href="/dashboard/billing">View plans &amp; credit history</Link>
      </Button>
    </div>
  );
}
