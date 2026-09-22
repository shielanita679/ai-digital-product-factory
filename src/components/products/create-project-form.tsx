"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createProjectSchema, type CreateProjectValues } from "@/lib/validations/project";
import { productTypeOptions } from "@/config/product-types";
import { createProjectAction } from "@/app/actions/projects";

export function CreateProjectForm() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { productType: "svg_bundle" },
  });

  async function onSubmit(values: CreateProjectValues) {
    setServerError(null);
    const result = await createProjectAction(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push(`/dashboard/products/${result.data.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="project-name">Product name</Label>
        <Input
          id="project-name"
          placeholder="Funny Halloween Cat Bundle"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="project-type">Product type</Label>
        <Select id="project-type" aria-invalid={!!errors.productType} {...register("productType")}>
          {productTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.beta ? " (Beta)" : ""}
            </option>
          ))}
        </Select>
        {errors.productType && (
          <p className="text-sm text-destructive">{errors.productType.message}</p>
        )}
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Button type="submit" variant="brand" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        <Sparkles className="size-4" />
        Create Product
      </Button>
    </form>
  );
}
