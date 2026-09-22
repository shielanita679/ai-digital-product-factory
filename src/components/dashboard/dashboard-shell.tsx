"use client";

import * as React from "react";
import { Menu, LogOut } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function LogOutButton({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <form action={onSignOut}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        <LogOut className="size-4" />
        Log Out
      </button>
    </form>
  );
}

export function DashboardShell({
  email,
  initials,
  onSignOut,
  children,
}: {
  email: string;
  initials: string;
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 p-4 lg:flex">
        <div className="px-2 py-2">
          <Logo />
        </div>
        <div className="mt-6 flex flex-1 flex-col">
          <SidebarNav />
        </div>
        <LogOutButton onSignOut={onSignOut} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent className="w-72">
                <SheetHeader>
                  <SheetTitle>
                    <Logo />
                  </SheetTitle>
                </SheetHeader>
                <SidebarNav onNavigate={() => setOpen(false)} />
                <LogOutButton onSignOut={onSignOut} />
              </SheetContent>
            </Sheet>
            <Logo />
          </div>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="hidden text-muted-foreground sm:inline-flex"
              title="Credit tracking isn't wired up yet"
            >
              — credits
            </Badge>
            <ThemeToggle />
            <div
              title={email}
              className="flex size-9 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white"
            >
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 bg-muted/20 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
