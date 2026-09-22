import type { Metadata } from "next";
import { Coins, FolderKanban, Palette, Download, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Dashboard",
};

const stats = [
  { label: "Credits remaining", value: "20", icon: Coins },
  { label: "Products", value: "0", icon: FolderKanban },
  { label: "Designs generated", value: "0", icon: Palette },
  { label: "Downloads", value: "0", icon: Download },
];

const templateTeasers = [
  "Christmas SVG Bundle",
  "Halloween SVG Bundle",
  "Teacher SVG Bundle",
  "Funny Cat Bundle",
  "Dog Mom Bundle",
  "Floral Bundle",
];

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s an overview of your account. The product wizard
            unlocks in a future phase of the build.
          </p>
        </div>
        <Button variant="brand" disabled className="opacity-70">
          <Sparkles className="size-4" />
          Create Product
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-xl font-semibold leading-none">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white">
            <FolderKanban className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">No products yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Turn your first idea into a complete digital product.
          </p>
          <Button variant="brand" disabled className="mt-2 opacity-70">
            <Sparkles className="size-4" />
            Create Product
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick-start templates</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {templateTeasers.map((template) => (
            <Badge
              key={template}
              variant="outline"
              className="cursor-not-allowed px-3 py-1.5 text-muted-foreground/60"
            >
              {template}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
