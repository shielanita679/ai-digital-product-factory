"use client";

import { SelectableCard } from "@/components/ui/selectable-card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { styleOptions, type StyleValue } from "@/config/styles";

export function StepStyle({
  styles,
  customStyle,
  onToggleStyle,
  onCustomStyleChange,
  error,
}: {
  styles: StyleValue[];
  customStyle: string;
  onToggleStyle: (value: StyleValue) => void;
  onCustomStyleChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Choose a style</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select one or more styles, or describe your own.
        </p>
      </div>

      <fieldset className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <legend className="sr-only">Style</legend>
        {styleOptions.map((option) => (
          <SelectableCard
            key={option.value}
            type="checkbox"
            label={option.label}
            selected={styles.includes(option.value)}
            onToggle={() => onToggleStyle(option.value)}
          />
        ))}
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label htmlFor="wizard-custom-style">Custom style (optional)</Label>
        <Input
          id="wizard-custom-style"
          value={customStyle}
          onChange={(e) => onCustomStyleChange(e.target.value)}
          placeholder="1970s retro typography with warm colors"
          maxLength={200}
        />
      </div>
    </div>
  );
}
