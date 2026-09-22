export const siteConfig = {
  name: "AI Digital Product Factory",
  shortName: "Product Factory",
  tagline: "Turn Ideas Into Sellable Digital Products",
  description:
    "AI Digital Product Factory generates original designs, SVGs, mockups, listing copy, and downloadable product bundles for Etsy, Cricut, print-on-demand, and craft sellers — in minutes.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

export type NavLink = {
  label: string;
  href: string;
};

export const marketingNav: NavLink[] = [
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Examples", href: "/#examples" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

export const footerNav: { title: string; links: NavLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How It Works", href: "/#how-it-works" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Examples", href: "/#examples" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "FAQ", href: "/#faq" },
      { label: "Login", href: "/login" },
      { label: "Create Account", href: "/register" },
    ],
  },
];
