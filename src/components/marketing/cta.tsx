import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-6 py-16 text-center shadow-xl shadow-primary/20 sm:px-16">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Turn your next idea into a sellable product today
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-white/85">
            No design software, no vectorizing tools, no separate mockup app.
            Just one idea, and a complete product package.
          </p>
          <div className="mt-8 flex justify-center">
            <Button
              size="lg"
              variant="secondary"
              className="bg-white text-slate-900 hover:bg-white/90"
              asChild
            >
              <Link href="/register">
                Create Your First Product
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
