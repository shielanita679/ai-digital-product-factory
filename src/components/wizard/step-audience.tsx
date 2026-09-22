"use client";

import { SelectableCard } from "@/components/ui/selectable-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { audienceOptions, type AudienceValue } from "@/config/audiences";

export function StepAudience({
  audiences,
  customAudience,
  onToggleAudience,
  onCustomAudienceChange,
}: {
  audiences: AudienceValue[];
  customAudience: string;
  onToggleAudience: (value: AudienceValue) => void;
  onCustomAudienceChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Who is this for?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional — select any audiences that fit, or describe your own.
        </p>
      </div>

      <fieldset className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <legend className="sr-only">Target audience</legend>
        {audienceOptions.map((option) => (
          <SelectableCard
            key={option.value}
            type="checkbox"
            label={option.label}
            selected={audiences.includes(option.value)}
            onToggle={() => onToggleAudience(option.value)}
          />
        ))}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="wizard-custom-audience">Custom audience (optional)</Label>
        <Input
          id="wizard-custom-audience"
          value={customAudience}
          onChange={(e) => onCustomAudienceChange(e.target.value)}
          placeholder="New dog owners"
          maxLength={200}
        />
      </div>
    </div>
  );
}
