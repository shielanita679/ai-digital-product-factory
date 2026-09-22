"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, PartyPopper } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectableCard } from "@/components/onboarding/selectable-card";
import {
  sellsWhatOptions,
  sellsWhereOptions,
  monthlyVolumeOptions,
  optionLabel,
} from "@/config/onboarding";
import { onboardingSchema } from "@/lib/validations/onboarding";
import { saveOnboardingAction } from "@/app/actions/onboarding";

type FormState = {
  sellsWhat: string[];
  sellsWhere: string[];
  monthlyVolume: string;
};

const TOTAL_STEPS = 4;

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function OnboardingWizard({ firstName }: { firstName: string | null }) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState<FormState>({
    sellsWhat: [],
    sellsWhere: [],
    monthlyVolume: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const canContinue =
    step === 1 ? form.sellsWhat.length > 0 :
    step === 2 ? form.sellsWhere.length > 0 :
    step === 3 ? form.monthlyVolume.length > 0 :
    true;

  function goNext() {
    if (!canContinue) return;
    setError(null);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleFinish() {
    const parsed = onboardingSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete all steps.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await saveOnboardingAction(parsed.data);
      if (!result.ok) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }
      // saveOnboardingAction redirects server-side on success; this is a
      // fallback in case that ever changes.
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
        >
          <div
            className="h-full rounded-full bg-brand-gradient transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        <CardTitle className="mt-4 text-xl">
          {step === 1 && "What do you sell?"}
          {step === 2 && "Where do you sell?"}
          {step === 3 && "How many digital products do you create per month?"}
          {step === 4 && "You're all set"}
        </CardTitle>
        <CardDescription>
          {step === 1 && "Select everything that applies."}
          {step === 2 && "Select everything that applies."}
          {step === 3 && "Pick the option closest to your pace."}
          {step === 4 &&
            `Welcome aboard${firstName ? `, ${firstName}` : ""}. Here's what we'll use to tailor your workspace.`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === 1 && (
          <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <legend className="sr-only">What do you sell?</legend>
            {sellsWhatOptions.map((option) => (
              <SelectableCard
                key={option.value}
                type="checkbox"
                label={option.label}
                selected={form.sellsWhat.includes(option.value)}
                onToggle={() =>
                  setForm((f) => ({ ...f, sellsWhat: toggleValue(f.sellsWhat, option.value) }))
                }
              />
            ))}
          </fieldset>
        )}

        {step === 2 && (
          <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <legend className="sr-only">Where do you sell?</legend>
            {sellsWhereOptions.map((option) => (
              <SelectableCard
                key={option.value}
                type="checkbox"
                label={option.label}
                selected={form.sellsWhere.includes(option.value)}
                onToggle={() =>
                  setForm((f) => ({ ...f, sellsWhere: toggleValue(f.sellsWhere, option.value) }))
                }
              />
            ))}
          </fieldset>
        )}

        {step === 3 && (
          <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <legend className="sr-only">
              Approximately how many digital products do you create per month?
            </legend>
            {monthlyVolumeOptions.map((option) => (
              <SelectableCard
                key={option.value}
                type="radio"
                name="monthlyVolume"
                label={option.label}
                selected={form.monthlyVolume === option.value}
                onToggle={() => setForm((f) => ({ ...f, monthlyVolume: option.value }))}
              />
            ))}
          </fieldset>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-gradient text-white">
                <PartyPopper className="size-6" />
              </span>
            </div>
            <dl className="space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <div>
                <dt className="font-medium text-foreground">You sell</dt>
                <dd className="mt-1 text-muted-foreground">
                  {form.sellsWhat.map((v) => optionLabel(sellsWhatOptions, v)).join(", ")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Where</dt>
                <dd className="mt-1 text-muted-foreground">
                  {form.sellsWhere.map((v) => optionLabel(sellsWhereOptions, v)).join(", ")}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Monthly volume</dt>
                <dd className="mt-1 text-muted-foreground">
                  {optionLabel(monthlyVolumeOptions, form.monthlyVolume)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={step === 1 || isSubmitting}
            className={step === 1 ? "invisible" : undefined}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          {step < TOTAL_STEPS ? (
            <Button type="button" variant="brand" onClick={goNext} disabled={!canContinue}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" variant="brand" onClick={handleFinish} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Go to Dashboard
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
