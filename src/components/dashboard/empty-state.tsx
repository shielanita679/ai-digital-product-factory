import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent
        className={cn(
          "flex flex-col items-center gap-3 text-center",
          compact ? "py-10" : "py-16",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-2xl bg-brand-gradient text-white",
            compact ? "size-11" : "size-14",
          )}
        >
          <Icon className={compact ? "size-5" : "size-6"} />
        </span>
        <h3 className={compact ? "text-base font-semibold" : "text-lg font-semibold"}>
          {title}
        </h3>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}
