"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WizardProgress } from "@/components/wizard/wizard-progress";
import { StepIdea } from "@/components/wizard/step-idea";
import { StepProductType } from "@/components/wizard/step-product-type";
import { StepStyle } from "@/components/wizard/step-style";
import { StepAudience } from "@/components/wizard/step-audience";
import { StepDesignOptions } from "@/components/wizard/step-design-options";
import { StepReview } from "@/components/wizard/step-review";
import { useWizardDraft } from "@/components/wizard/use-wizard-draft";
import type { ProductType } from "@/config/product-types";
import type { StyleValue } from "@/config/styles";
import type { AudienceValue } from "@/config/audiences";
import type { ContentMode, ColorMode, Orientation, DetailLevel } from "@/config/design-options";
import { getSmartDefaults } from "@/config/design-options";
import { promptSchema, wizardConfigSchema } from "@/lib/validations/wizard";
import { deriveProjectName } from "@/lib/derive-project-name";
import { createProjectFromWizardAction } from "@/app/actions/projects";

export type WizardState = {
  name: string;
  prompt: string;
  productType: ProductType;
  styles: StyleValue[];
  customStyle: string;
  audiences: AudienceValue[];
  customAudience: string;
  designCount: number;
  contentMode: ContentMode;
  colorMode: ColorMode;
  customColors: string;
  transparentBackground: boolean;
  orientation: Orientation;
  detailLevel: DetailLevel;
};

const initialWizardState: WizardState = {
  name: "",
  prompt: "",
  productType: "svg_bundle",
  styles: [],
  customStyle: "",
  audiences: [],
  customAudience: "",
  designCount: 10,
  contentMode: "text_and_graphics",
  colorMode: "no_preference",
  customColors: "",
  transparentBackground: true,
  orientation: "square",
  detailLevel: "medium",
};

const TOTAL_STEPS = 6;

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** The step number travels with the draft too, so "Resume draft" returns
 *  the user to where they left off, not just restores the field values. */
type DraftPayload = { step: number; data: WizardState };

const initialDraftPayload: DraftPayload = { step: 1, data: initialWizardState };

export function CreateProductWizard() {
  const router = useRouter();
  const {
    state: draft,
    setState: setDraft,
    hasPendingDraft,
    resumeDraft,
    discardDraft,
    clearDraft,
  } = useWizardDraft<DraftPayload>(initialDraftPayload);
  const wizard = draft.data;
  const step = draft.step;
  const [fieldErrors, setFieldErrors] = React.useState<{ prompt?: string; styles?: string; customColors?: string }>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const submittingRef = React.useRef(false);

  function setWizard(updater: (w: WizardState) => WizardState) {
    setDraft((d) => ({ ...d, data: updater(d.data) }));
  }

  function setStep(updater: number | ((s: number) => number)) {
    setDraft((d) => ({ ...d, step: typeof updater === "function" ? updater(d.step) : updater }));
  }

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setWizard((w) => ({ ...w, [key]: value }));
  }

  function handleProductTypeChange(newType: ProductType) {
    if (newType === wizard.productType) return;
    const defaults = getSmartDefaults(newType);
    setWizard((w) => ({
      ...w,
      productType: newType,
      designCount: defaults.requestedDesignCount,
      transparentBackground: defaults.transparentBackground,
      orientation: defaults.orientation,
      detailLevel: defaults.detailLevel,
    }));
  }

  function validateStep(current: number): boolean {
    if (current === 1) {
      const result = promptSchema.safeParse(wizard.prompt);
      if (!result.success) {
        setFieldErrors((e) => ({ ...e, prompt: result.error.issues[0]?.message }));
        return false;
      }
      setFieldErrors((e) => ({ ...e, prompt: undefined }));
      return true;
    }
    if (current === 3) {
      if (wizard.styles.length === 0 && wizard.customStyle.trim().length === 0) {
        setFieldErrors((e) => ({ ...e, styles: "Choose at least one style or describe a custom one" }));
        return false;
      }
      setFieldErrors((e) => ({ ...e, styles: undefined }));
      return true;
    }
    if (current === 5) {
      if (wizard.colorMode === "custom" && wizard.customColors.trim().length === 0) {
        setFieldErrors((e) => ({ ...e, customColors: "Describe the colors you want" }));
        return false;
      }
      setFieldErrors((e) => ({ ...e, customColors: undefined }));
      return true;
    }
    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit() {
    if (submittingRef.current) return;

    // Full server-side-mirrored validation before submitting — never trust
    // that step-by-step client checks alone were sufficient.
    const finalName = wizard.name.trim() || deriveProjectName(wizard.prompt);
    const payload = { ...wizard, name: finalName };
    const parsed = wizardConfigSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? "Please check your entries before continuing.");
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await createProjectFromWizardAction(parsed.data);
      if (!result.ok) {
        setSubmitError(result.error);
        setIsSubmitting(false);
        submittingRef.current = false;
        return;
      }
      clearDraft();
      router.push(`/dashboard/products/${result.data.id}`);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {hasPendingDraft && (
        <Card className="border-accent bg-accent/40">
          <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <p className="text-sm">
              You have a saved draft from a previous session. Resume where you left off?
            </p>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={discardDraft}>
                Start fresh
              </Button>
              <Button type="button" variant="brand" size="sm" onClick={resumeDraft}>
                Resume draft
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <WizardProgress step={step} />

      <Card>
        <CardContent className="p-5 sm:p-6">
          {step === 1 && (
            <StepIdea
              prompt={wizard.prompt}
              onChange={(value) => {
                update("prompt", value);
                if (fieldErrors.prompt) setFieldErrors((e) => ({ ...e, prompt: undefined }));
              }}
              error={fieldErrors.prompt}
            />
          )}

          {step === 2 && (
            <StepProductType value={wizard.productType} onChange={handleProductTypeChange} />
          )}

          {step === 3 && (
            <StepStyle
              styles={wizard.styles}
              customStyle={wizard.customStyle}
              onToggleStyle={(value) => {
                update("styles", toggleValue(wizard.styles, value));
                if (fieldErrors.styles) setFieldErrors((e) => ({ ...e, styles: undefined }));
              }}
              onCustomStyleChange={(value) => {
                update("customStyle", value);
                if (fieldErrors.styles) setFieldErrors((e) => ({ ...e, styles: undefined }));
              }}
              error={fieldErrors.styles}
            />
          )}

          {step === 4 && (
            <StepAudience
              audiences={wizard.audiences}
              customAudience={wizard.customAudience}
              onToggleAudience={(value) => update("audiences", toggleValue(wizard.audiences, value))}
              onCustomAudienceChange={(value) => update("customAudience", value)}
            />
          )}

          {step === 5 && (
            <StepDesignOptions
              productType={wizard.productType}
              designCount={wizard.designCount}
              onDesignCountChange={(value) => update("designCount", value)}
              contentMode={wizard.contentMode}
              onContentModeChange={(value) => update("contentMode", value)}
              colorMode={wizard.colorMode}
              onColorModeChange={(value) => {
                update("colorMode", value);
                if (fieldErrors.customColors) setFieldErrors((e) => ({ ...e, customColors: undefined }));
              }}
              customColors={wizard.customColors}
              onCustomColorsChange={(value) => {
                update("customColors", value);
                if (fieldErrors.customColors) setFieldErrors((e) => ({ ...e, customColors: undefined }));
              }}
              transparentBackground={wizard.transparentBackground}
              onTransparentBackgroundChange={(value) => update("transparentBackground", value)}
              orientation={wizard.orientation}
              onOrientationChange={(value) => update("orientation", value)}
              detailLevel={wizard.detailLevel}
              onDetailLevelChange={(value) => update("detailLevel", value)}
              errors={{ customColors: fieldErrors.customColors }}
            />
          )}

          {step === 6 && (
            <StepReview
              state={wizard}
              name={wizard.name || deriveProjectName(wizard.prompt)}
              onNameChange={(value) => update("name", value)}
              onEditStep={setStep}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              submitError={submitError}
            />
          )}
        </CardContent>
      </Card>

      {step < TOTAL_STEPS && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={step === 1}
            className={step === 1 ? "invisible" : undefined}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button type="button" variant="brand" onClick={goNext}>
            Continue
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      {step === TOTAL_STEPS && (
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={goBack} disabled={isSubmitting}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
