import {
  Lightbulb,
  Wand2,
  Shapes,
  Image as ImageIcon,
  PackageCheck,
} from "lucide-react";
import { ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";

const steps = [
  { label: "Idea", icon: Lightbulb },
  { label: "Designs", icon: Wand2 },
  { label: "Vector SVG", icon: Shapes },
  { label: "Mockups", icon: ImageIcon },
  { label: "ZIP Package", icon: PackageCheck },
];

export function WorkflowVisual() {
  return (
    <Card className="overflow-hidden p-4 sm:p-6">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;

          return (
            <div key={step.label} className="flex items-center gap-2 sm:contents">
              <div className="flex flex-1 flex-col items-center gap-2 rounded-xl bg-muted/60 px-4 py-5 text-center sm:flex-1">
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-gradient text-white">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-medium">{step.label}</span>
              </div>

              {!isLast && (
                <ChevronRight
                  aria-hidden
                  className="hidden size-5 shrink-0 text-muted-foreground sm:block"
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
