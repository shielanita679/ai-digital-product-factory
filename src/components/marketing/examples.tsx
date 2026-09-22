import { Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const examples = [
  {
    prompt: "20 funny Halloween cat SVGs for Cricut",
    type: "SVG Bundle",
    style: "Cute · Bold outlines",
  },
  {
    prompt: "Boho floral wall art set for a print-on-demand shop",
    type: "Wall Art",
    style: "Boho · Watercolor",
  },
  {
    prompt: "10 teacher-life sticker designs with short quotes",
    type: "Sticker Pack",
    style: "Hand drawn · Typography",
  },
  {
    prompt: "Minimal dog-mom SVG bundle for tumblers and shirts",
    type: "SVG Bundle",
    style: "Minimal · Line art",
  },
];

export function Examples() {
  return (
    <section id="examples" className="scroll-mt-20 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            The kind of ideas people start with
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every product starts as a single-sentence idea. Here&apos;s what
            that looks like once it enters the wizard.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {examples.map((example) => (
            <Card key={example.prompt}>
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white">
                    <Sparkles className="size-4" />
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    &ldquo;{example.prompt}&rdquo;
                  </p>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="secondary">{example.type}</Badge>
                <Badge variant="outline">{example.style}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
