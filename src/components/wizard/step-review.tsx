"use client";

import { Pencil, Sparkles, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { productTypeLabel } from "@/config/product-types";
import { styleOptions } from "@/config/styles";
import { audienceOptions } from "@/config/audiences";
import { labelFor, contentModeOptions, colorModeOptions, orientationOptions, detailLevelOptions } from "@/config/design-options";
import { estimateGenerationCredits } from "@/lib/estimate-credits";
import type { WizardState } from "@/components/wizard/create-product-wizard";

function ReviewRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm">{value}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Pencil className="size-3" />
        Edit
      </button>
    </div>
  );
}

export function StepReview({
  state,
  name,
  onNameChange,
  onEditStep,
  onSubmit,
  isSubmitting,
  submitError,
}: {
  state: WizardState;
  name: string;
  onNameChange: (value: string) => void;
  onEditStep: (step: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}) {
  const styleText =
    [...state.styles.map((v) => labelFor(styleOptions, v)), state.customStyle.trim()]
      .filter(Boolean)
      .join(", ") || "Not specified";
  const audienceText =
    [...state.audiences.map((v) => labelFor(audienceOptions, v)), state.customAudience.trim()]
      .filter(Boolean)
      .join(", ") || "Anyone";
  const colorText =
    state.colorMode === "custom"
      ? state.customColors.trim() || "Custom colors"
      : labelFor(colorModeOptions, state.colorMode);

  const estimate = estimateGenerationCredits({ designCount: state.designCount });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Review your product</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirm everything looks right before creating your product.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="wizard-review-name">Product name</Label>
        <Input
          id="wizard-review-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={80}
        />
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-5">
          <ReviewRow label="Product idea" value={state.prompt} onEdit={() => onEditStep(1)} />
          <ReviewRow
            label="Product type"
            value={productTypeLabel(state.productType)}
            onEdit={() => onEditStep(2)}
          />
          <ReviewRow label="Style" value={styleText} onEdit={() => onEditStep(3)} />
          <ReviewRow label="Target audience" value={audienceText} onEdit={() => onEditStep(4)} />
          <ReviewRow
            label="Number of designs"
            value={String(state.designCount)}
            onEdit={() => onEditStep(5)}
          />
          <ReviewRow
            label="Content mode"
            value={labelFor(contentModeOptions, state.contentMode)}
            onEdit={() => onEditStep(5)}
          />
          <ReviewRow label="Colors" value={colorText} onEdit={() => onEditStep(5)} />
          <ReviewRow
            label="Transparent background"
            value={state.transparentBackground ? "On" : "Off"}
            onEdit={() => onEditStep(5)}
          />
          <ReviewRow
            label="Orientation"
            value={labelFor(orientationOptions, state.orientation)}
            onEdit={() => onEditStep(5)}
          />
          <ReviewRow
            label="Detail level"
            value={labelFor(detailLevelOptions, state.detailLevel)}
            onEdit={() => onEditStep(5)}
          />
        </CardContent>
      </Card>

      <Card className="border-accent bg-accent/40">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium">Estimated generation usage</p>
            <p className="text-xs text-muted-foreground">
              {estimate} design generation{estimate === 1 ? "" : "s"} — preview only, nothing is
              charged yet. The real credit system arrives in a later phase.
            </p>
          </div>
        </CardContent>
      </Card>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button
        type="button"
        variant="brand"
        size="lg"
        className="w-full"
        onClick={onSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        <Sparkles className="size-4" />
        Create Product
      </Button>
    </div>
  );
}
