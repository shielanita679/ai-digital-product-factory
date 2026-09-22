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
} from "lucide-react";

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Route isn't built yet — rendered disabled with a "Soon" badge. */
  comingSoon?: boolean;
};

export const dashboardNav: DashboardNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Create Product", href: "/dashboard/create", icon: Sparkles },
  { label: "My Products", href: "/dashboard/products", icon: FolderKanban },
  { label: "Designs", href: "/dashboard/designs", icon: Palette, comingSoon: true },
  { label: "Mockups", href: "/dashboard/mockups", icon: ImageIcon, comingSoon: true },
  { label: "Downloads", href: "/dashboard/downloads", icon: Download, comingSoon: true },
  { label: "Templates", href: "/dashboard/templates", icon: LayoutTemplate, comingSoon: true },
  { label: "Credits", href: "/dashboard/credits", icon: Coins, comingSoon: true },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard, comingSoon: true },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, comingSoon: true },
];
