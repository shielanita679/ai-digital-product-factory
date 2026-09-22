import {
  Wand2,
  Shapes,
  Layers,
  ImageIcon,
  FileText,
  ShieldCheck,
  FolderArchive,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Wand2,
    title: "AI Design Generator",
    description:
      "Describe an idea and generate original artwork concepts and full collections, not a single one-off image.",
  },
  {
    icon: Shapes,
    title: "SVG Generator",
    description:
      "Convert generated artwork into genuine vector paths, ready for Cricut, Silhouette, and other cutting machines.",
  },
  {
    icon: Layers,
    title: "Bundle Generator",
    description:
      "Group designs into an organized, consistently named product bundle in a few clicks.",
  },
  {
    icon: ImageIcon,
    title: "Mockup Generator",
    description:
      "Preview designs on t-shirts, mugs, tote bags, posters, and more with realistic product mockups.",
  },
  {
    icon: FileText,
    title: "Listing Generator",
    description:
      "Generate titles, descriptions, tags, and suggested pricing modeled on real marketplace listings.",
  },
  {
    icon: ShieldCheck,
    title: "Commercial License Generator",
    description:
      "Attach a configurable commercial-use license to every product you sell, ready to customize.",
  },
  {
    icon: FolderArchive,
    title: "ZIP Product Packager",
    description:
      "Package SVGs, PNGs, mockups, license, and listing copy into one organized, downloadable ZIP file.",
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything you need, in one workspace
          </h2>
          <p className="mt-4 text-muted-foreground">
            No more juggling separate design, vectorizing, mockup, and listing
            tools. It all happens in one guided workflow.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className="transition-shadow hover:shadow-md"
              >
                <CardHeader>
                  <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-5" />
                  </span>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
