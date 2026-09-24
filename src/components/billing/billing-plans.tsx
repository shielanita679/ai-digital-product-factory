"use client";

import * as React from "react";
import { Loader2, Check } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createCheckoutSessionAction } from "@/app/actions/billing";
import { isPurchasablePlan, type Plan, type PlanId } from "@/config/plans";

export function BillingPlans({
  plans,
  currentPlanId,
  isEntitled,
  stripeConfigured,
  priceConfiguredByPlanId,
}: {
  plans: Plan[];
  currentPlanId: PlanId;
  isEntitled: boolean;
  stripeConfigured: boolean;
  priceConfiguredByPlanId: Partial<Record<PlanId, boolean>>;
}) {
  const [pendingPlanId, setPendingPlanId] = React.useState<PlanId | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubscribe(planId: PlanId) {
    if (!isPurchasablePlan(planId)) return;
    setPendingPlanId(planId);
    setError(null);
    const result = await createCheckoutSessionAction({ planId });
    setPendingPlanId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.assign(result.data.url);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Plans</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const purchasable = isPurchasablePlan(plan.id);
          const priceReady = purchasable ? !!priceConfiguredByPlanId[plan.id] : false;
          const disabled = isCurrent || !purchasable || !stripeConfigured || !priceReady || (isEntitled && !isCurrent) || pendingPlanId !== null;

          let buttonLabel = plan.cta;
          if (isCurrent) buttonLabel = "Current Plan";
          else if (isEntitled) buttonLabel = "Use Manage Billing to switch";
          else if (!purchasable) buttonLabel = "Not available";
          else if (!stripeConfigured || !priceReady) buttonLabel = "Not configured";

          return (
            <Card key={plan.id} className={cn("relative flex flex-col", isCurrent && "border-primary/40")}>
              {plan.highlighted && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="accent">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <h3 className="text-base font-semibold">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tracking-tight">${plan.price}</span>
                  <span className="text-xs text-muted-foreground">{plan.priceSuffix}</span>
                </div>
                <p className="text-xs text-muted-foreground">{plan.description}</p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-xs">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={disabled}
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {pendingPlanId === plan.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {buttonLabel}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
