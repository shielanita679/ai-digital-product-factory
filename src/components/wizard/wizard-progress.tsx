import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const STEP_LABELS = ["Idea", "Product Type", "Style", "Audience", "Design Options", "Review"];

export function WizardProgress({ step }: { step: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          Step {step} of {STEP_LABELS.length}: {STEP_LABELS[step - 1]}
        </span>
        <span className="hidden sm:inline">{Math.round((step / STEP_LABELS.length) * 100)}%</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={STEP_LABELS.length}
        aria-label={`Step ${step} of ${STEP_LABELS.length}`}
      >
        <div
          className="h-full rounded-full bg-brand-gradient transition-all duration-300"
          style={{ width: `${(step / STEP_LABELS.length) * 100}%` }}
        />
      </div>
      <ol className="mt-3 hidden gap-1 sm:flex">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const isDone = stepNumber < step;
          const isCurrent = stepNumber === step;
          return (
            <li
              key={label}
              className={cn(
                "flex flex-1 items-center gap-1.5 text-xs font-medium",
                isCurrent ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border border-primary text-primary"
                      : "border border-border",
                )}
              >
                {isDone ? <Check className="size-2.5" /> : stepNumber}
              </span>
              <span className="hidden truncate lg:inline">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
