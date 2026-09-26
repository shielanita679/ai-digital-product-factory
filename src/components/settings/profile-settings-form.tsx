"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectableCard } from "@/components/ui/selectable-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sellsWhatOptions, sellsWhereOptions, monthlyVolumeOptions } from "@/config/onboarding";
import { profileSettingsSchema } from "@/lib/validations/settings";
import { updateProfileSettingsAction } from "@/app/actions/settings";
import type { Profile } from "@/types/supabase";

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ProfileSettingsForm({ profile, email }: { profile: Profile | null; email: string }) {
  const [fullName, setFullName] = React.useState(profile?.full_name ?? "");
  const [sellsWhat, setSellsWhat] = React.useState<string[]>(profile?.sells_what ?? []);
  const [sellsWhere, setSellsWhere] = React.useState<string[]>(profile?.sells_where ?? []);
  const [monthlyVolume, setMonthlyVolume] = React.useState(profile?.monthly_product_volume ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    setError(null);

    const parsed = profileSettingsSchema.safeParse({ fullName, sellsWhat, sellsWhere, monthlyVolume });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form and try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateProfileSettingsAction(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
          <CardDescription>Your name and email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} readOnly disabled />
            <p className="text-xs text-muted-foreground">
              Changing your email isn&apos;t supported yet — contact support if you need this changed.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What do you sell?</CardTitle>
          <CardDescription>Select everything that applies.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <legend className="sr-only">What do you sell?</legend>
            {sellsWhatOptions.map((option) => (
              <SelectableCard
                key={option.value}
                type="checkbox"
                label={option.label}
                selected={sellsWhat.includes(option.value)}
                onToggle={() => setSellsWhat((list) => toggleValue(list, option.value))}
              />
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Where do you sell?</CardTitle>
          <CardDescription>Select everything that applies.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <legend className="sr-only">Where do you sell?</legend>
            {sellsWhereOptions.map((option) => (
              <SelectableCard
                key={option.value}
                type="checkbox"
                label={option.label}
                selected={sellsWhere.includes(option.value)}
                onToggle={() => setSellsWhere((list) => toggleValue(list, option.value))}
              />
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly volume</CardTitle>
          <CardDescription>Pick the option closest to your pace.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <legend className="sr-only">Monthly product volume</legend>
            {monthlyVolumeOptions.map((option) => (
              <SelectableCard
                key={option.value}
                type="radio"
                name="monthlyVolume"
                label={option.label}
                selected={monthlyVolume === option.value}
                onToggle={() => setMonthlyVolume(option.value)}
              />
            ))}
          </fieldset>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </p>
      )}

      <Button type="submit" variant="brand" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        Save changes
      </Button>
    </form>
  );
}
