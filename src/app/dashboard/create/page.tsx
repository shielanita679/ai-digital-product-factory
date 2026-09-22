import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowVisual } from "@/components/marketing/workflow-visual";
import { CreateProjectForm } from "@/components/products/create-project-form";

export const metadata: Metadata = {
  title: "Create Product",
};

export default function CreateProductPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a new product</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This is where the guided idea-to-product wizard will live — describe
          an idea, generate a full design collection, vectorize it to SVG,
          build mockups, and package a listing. That workflow arrives in a
          later phase of the build.
        </p>
      </div>

      <WorkflowVisual />

      <Card>
        <CardHeader>
          <CardTitle>Start a blank product</CardTitle>
          <CardDescription>
            For now, give your product a name and type to create its
            workspace. You&apos;ll be able to add designs once the generator
            is connected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateProjectForm />
        </CardContent>
      </Card>
    </div>
  );
}
