import { History } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { creditEntryTypeLabel } from "@/config/credits";
import type { CreditLedgerEntry } from "@/types/supabase";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function CreditHistory({ entries }: { entries: CreditLedgerEntry[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Credit history</p>
      {entries.length === 0 ? (
        <EmptyState icon={History} title="No credit activity yet" description="Generations, grants, and refunds will show up here." compact />
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{creditEntryTypeLabel(entry.entry_type)}</p>
                  <p className="truncate text-xs text-muted-foreground">{entry.reason}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className={`text-sm font-medium ${entry.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                    {entry.amount > 0 ? "+" : ""}
                    {entry.amount.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
