"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ADMIN_NAV = [
  { label: "Users", href: "/admin/users" },
  { label: "Projects", href: "/admin/projects" },
  { label: "Billing", href: "/admin/billing" },
  { label: "System", href: "/admin/system" },
];

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ADMIN_NAV.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open admin menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-72">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <AdminNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Logo />
          <Badge variant="outline">Admin</Badge>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Back to Dashboard
        </Link>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card/40 p-4 lg:flex">
          <AdminNav />
        </aside>

        <main className="min-w-0 flex-1 overflow-x-hidden bg-muted/20 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
