import Link from "next/link";
import { ArrowLeft, Sparkles, Wand2, PackageCheck } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const highlights = [
  {
    icon: Wand2,
    text: "Generate full design collections from one idea",
  },
  {
    icon: Sparkles,
    text: "Convert artwork into cutting-machine-ready SVGs",
  },
  {
    icon: PackageCheck,
    text: "Package mockups, listing copy, and license into one ZIP",
  },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-gradient p-10 text-white lg:flex">
        <Logo />

        <div className="max-w-sm">
          <h2 className="text-2xl font-semibold text-balance">
            Turn ideas into sellable digital products in minutes.
          </h2>
          <ul className="mt-8 space-y-4">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-sm text-white/90">{item.text}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-xs text-white/70">
          &copy; {new Date().getFullYear()} AI Digital Product Factory
        </p>
      </div>

      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex justify-center lg:hidden">
              <Logo />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
