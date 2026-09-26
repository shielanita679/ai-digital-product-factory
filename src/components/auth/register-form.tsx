"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { registerSchema, type RegisterValues } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { getAuthErrorMessage } from "@/lib/supabase/error-message";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      agreeToTerms: false,
    },
  });

  async function onSubmit(values: RegisterValues) {
    setFormError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { full_name: values.name },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding`,
        },
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      if (data.session) {
        // Email confirmations are disabled on this project — already signed in.
        router.push("/onboarding");
        router.refresh();
        return;
      }

      // Email confirmation required before a session is created.
      setSubmittedEmail(values.email);
    } catch (error) {
      setFormError(getAuthErrorMessage(error));
    }
  }

  if (submittedEmail) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-brand-gradient text-white">
            <MailCheck className="size-6" />
          </span>
          <CardTitle as="h1" className="text-xl">Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to <strong>{submittedEmail}</strong>.
            Click it to activate your account and get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Wrong email?{" "}
            <button
              type="button"
              onClick={() => setSubmittedEmail(null)}
              className="font-medium text-primary hover:underline"
            >
              Try again
            </button>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">Create your account</CardTitle>
        <CardDescription>
          Start turning ideas into sellable digital products.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              autoComplete="name"
              placeholder="Jamie Rivera"
              aria-invalid={!!errors.name}
              aria-describedby="name-error"
              {...register("name")}
            />
            {errors.name && (
              <p id="name-error" className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
              aria-describedby="email-error"
              {...register("email")}
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              aria-describedby="password-error"
              {...register("password")}
            />
            {errors.password && (
              <p id="password-error" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!errors.confirmPassword}
              aria-describedby="confirmPassword-error"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p id="confirmPassword-error" className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-start gap-2.5">
              <Controller
                control={control}
                name="agreeToTerms"
                render={({ field }) => (
                  <Checkbox
                    id="agreeToTerms"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-invalid={!!errors.agreeToTerms}
                    aria-describedby="agreeToTerms-error"
                  />
                )}
              />
              <Label htmlFor="agreeToTerms" className="text-sm font-normal text-muted-foreground">
                I agree to the Terms of Service and Privacy Policy.
              </Label>
            </div>
            {errors.agreeToTerms && (
              <p id="agreeToTerms-error" className="text-sm text-destructive">
                {errors.agreeToTerms.message}
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className="text-sm text-destructive">{formError}</p>
          )}

          <Button
            type="submit"
            variant="brand"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Create Account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
