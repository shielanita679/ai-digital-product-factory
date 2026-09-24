"use client";

import * as React from "react";
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createBillingPortalSessionAction } from "@/app/actions/billing";
import { subscriptionStatusMeta, subscriptionStatusLabel } from "@/config/subscription";
import { planLabel } from "@/config/plans";
import type { BillingState } from "@/lib/billing/billing-service";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function SubscriptionStatusCard({
  billingState,
  creditBalance,
  stripeConfigured,
}: {
  billingState: BillingState;
  creditBalance: number;
  stripeConfigured: boolean;
}) {
  const [isOpeningPortal, setIsOpeningPortal] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { subscription } = billingState;

  async function handleManageBilling() {
    setIsOpeningPortal(true);
    setError(null);
    const result = await createBillingPortalSessionAction();
    setIsOpeningPortal(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.assign(result.data.url);
  }

  const statusMeta = subscription ? subscriptionStatusMeta[subscription.status as keyof typeof subscriptionStatusMeta] : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Current plan</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-lg font-semibold">{planLabel(billingState.planId)}</span>
              {subscription && <Badge variant={statusMeta?.badgeVariant ?? "outline"}>{subscriptionStatusLabel(subscription.status)}</Badge>}
              {!subscription && <Badge variant="outline">Free</Badge>}
            </div>
            {subscription?.current_period_end && (
              <p className="mt-1 text-xs text-muted-foreground">
                {subscription.cancel_at_period_end ? "Cancels" : "Renews"} on {formatDate(subscription.current_period_end)}
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="text-sm font-medium">Credit balance</p>
            <p className="mt-1.5 text-2xl font-semibold">{creditBalance.toLocaleString()}</p>
          </div>
        </div>

        {subscription?.status === "past_due" && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" />
            Your last payment failed. Update your payment method to keep your subscription active — credits already granted remain in your account.
          </p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {subscription && (
          <div>
            <Button type="button" variant="outline" onClick={handleManageBilling} disabled={isOpeningPortal || !stripeConfigured}>
              {isOpeningPortal ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
              Manage Billing
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
