import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBillingSummary, getAnalyticsSummary } from "@/lib/admin/admin-service";
import { planLabel } from "@/config/plans";
import { subscriptionStatusLabel } from "@/config/subscription";
import { creditEntryTypeLabel } from "@/config/credits";

export const metadata: Metadata = { title: "Admin — Billing" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminBillingPage() {
  const [billing, analytics] = await Promise.all([getBillingSummary(), getAnalyticsSummary()]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Billing</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {Object.entries(analytics.planDistribution).map(([plan, count]) => (
              <div key={plan} className="flex justify-between">
                <span>{planLabel(plan)}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscriptions by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {Object.entries(billing.subscriptionCountByStatus)
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <div key={status} className="flex justify-between">
                  <span>{subscriptionStatusLabel(status)}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            {Object.values(billing.subscriptionCountByStatus).every((c) => c === 0) && (
              <p className="text-muted-foreground">No subscriptions yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook processing health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-4">
            {Object.entries(billing.webhookEventCountByStatus).map(([status, count]) => (
              <Badge key={status} variant={status === "failed" ? "outline" : "success"}>
                {status}: {count}
              </Badge>
            ))}
          </div>
          {billing.recentFailedWebhooks.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-medium">Recent failures</p>
              {billing.recentFailedWebhooks.map((w) => (
                <div key={w.stripeEventId} className="rounded-lg border border-border p-2 text-xs">
                  <span className="font-medium">{w.eventType}</span> — {w.errorMessage ?? "no error message"}
                  <span className="text-muted-foreground"> ({formatDate(w.createdAt)})</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent credit-ledger activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {billing.recentLedgerEntries.map((entry) => (
            <div key={entry.id} className="flex justify-between">
              <span>
                {creditEntryTypeLabel(entry.entryType)} — <span className="text-muted-foreground">{entry.reason}</span>
              </span>
              <span className={entry.amount < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                {entry.amount > 0 ? "+" : ""}
                {entry.amount}
              </span>
            </div>
          ))}
          {billing.recentLedgerEntries.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
