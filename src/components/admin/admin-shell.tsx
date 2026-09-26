import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";

const ADMIN_NAV = [
  { label: "Users", href: "/admin/users" },
  { label: "Projects", href: "/admin/projects" },
  { label: "Billing", href: "/admin/billing" },
  { label: "System", href: "/admin/system" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Logo />
          <Badge variant="outline">Admin</Badge>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Back to Dashboard
        </Link>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card/40 p-4 lg:flex">
          <nav className="flex flex-col gap-1">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 bg-muted/20 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
