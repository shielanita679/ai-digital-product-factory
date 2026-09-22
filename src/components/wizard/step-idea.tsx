"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MAX_PROMPT_LENGTH } from "@/lib/validations/wizard";

const inspirationSuggestions = [
  "Funny Halloween cats",
  "Christmas teacher quotes",
  "Floral wedding monograms",
  "Retro dog mom designs",
  "Motivational coffee quotes",
  "Cute dinosaur birthday designs",
];

export function StepIdea({
  prompt,
  onChange,
  error,
}: {
  prompt: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">What do you want to create?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe your idea in a sentence or two — you&apos;ll refine the
          details in the next steps.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="wizard-prompt">Your idea</Label>
        <Textarea
          id="wizard-prompt"
          rows={4}
          value={prompt}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
          placeholder="Create a bundle of funny Christmas cats for Cricut."
          aria-invalid={!!error}
          aria-describedby="wizard-prompt-count wizard-prompt-error"
        />
        <div className="flex items-center justify-between">
          <p id="wizard-prompt-error" className="text-sm text-destructive">
            {error}
          </p>
          <p id="wizard-prompt-count" className="shrink-0 text-xs text-muted-foreground">
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Need inspiration?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {inspirationSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(suggestion)}
              className="rounded-full"
            >
              <Badge
                variant="secondary"
                className="cursor-pointer px-3 py-1.5 transition-colors hover:bg-accent"
              >
                {suggestion}
              </Badge>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
