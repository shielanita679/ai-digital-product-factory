import type { Metadata } from "next";

import { CreateProductWizard } from "@/components/wizard/create-product-wizard";

export const metadata: Metadata = {
  title: "Create Product",
};

export default function CreateProductPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a new product</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe your idea and we&apos;ll set everything up for design
          generation. AI generation itself arrives in a later phase — for
          now this configures and saves your product.
        </p>
      </div>

      <CreateProductWizard />
    </div>
  );
}
