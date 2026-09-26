import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Sparkles,
  FolderKanban,
  Palette,
  ImageIcon,
  Download,
  LayoutTemplate,
  Coins,
  CreditCard,
  Settings,
  ShieldCheck,
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Route isn't built yet — rendered disabled with a "Soon" badge. */
  comingSoon?: boolean;
  /**
   * Cosmetic only — hides the link for non-admins so the sidebar isn't
   * cluttered with a link that would just redirect. This is NEVER the
   * authorization boundary: /admin/* pages independently re-verify
   * profiles.role server-side via requireAdmin() regardless of whether
   * this link was ever shown (see src/lib/auth/admin.ts).
   */
  adminOnly?: boolean;
};

export const dashboardNav: DashboardNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Create Product", href: "/dashboard/create", icon: Sparkles },
  { label: "My Products", href: "/dashboard/products", icon: FolderKanban },
  { label: "Designs", href: "/dashboard/designs", icon: Palette },
  { label: "Mockups", href: "/dashboard/mockups", icon: ImageIcon, comingSoon: true },
  { label: "Downloads", href: "/dashboard/downloads", icon: Download },
  { label: "Templates", href: "/dashboard/templates", icon: LayoutTemplate, comingSoon: true },
  { label: "Credits", href: "/dashboard/credits", icon: Coins, comingSoon: true },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
  { label: "Admin", href: "/admin", icon: ShieldCheck, adminOnly: true },
];
