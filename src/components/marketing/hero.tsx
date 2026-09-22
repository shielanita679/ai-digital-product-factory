import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkflowVisual } from "@/components/marketing/workflow-visual";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center blur-3xl"
      >
        <div className="h-[420px] w-[820px] rounded-full bg-brand-gradient opacity-20" />
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Badge variant="accent" className="mb-6">
            AI SVG &amp; Digital Product Factory
          </Badge>

          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Turn Ideas Into{" "}
            <span className="text-brand-gradient">Sellable Digital Products</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
            AI Digital Product Factory generates original designs, SVGs,
            mockups, listing copy, and downloadable product bundles for Etsy,
            Cricut, print-on-demand, and craft sellers — so one idea becomes a
            complete sellable product in minutes.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button size="lg" variant="brand" asChild>
              <Link href="/register">
                Create Your First Product
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#how-it-works">
                <PlayCircle className="size-4" />
                See How It Works
              </Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <WorkflowVisual />
        </div>
      </div>
    </section>
  );
}
