export const mainNav = [
  { href: "/shop", label: "Shop" },
  { href: "/collections", label: "Collections" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export const footerNav = {
  shop: [
    { href: "/shop", label: "All products" },
    { href: "/collections", label: "Collections" },
    { href: "/search", label: "Search" },
    { href: "/cart", label: "Cart" },
  ],
  help: [
    { href: "/contact", label: "Contact" },
    { href: "/faq", label: "FAQ" },
    { href: "/order-tracking", label: "Order tracking" },
    { href: "/shipping-policy", label: "Shipping" },
    { href: "/return-policy", label: "Returns & refunds" },
  ],
  company: [
    { href: "/about", label: "About" },
    { href: "/privacy-policy", label: "Privacy" },
    { href: "/terms-of-service", label: "Terms" },
    { href: "/payment-policy", label: "Payment policy" },
    { href: "/cookie-policy", label: "Cookie policy" },
  ],
} as const;

export const policyPages = [
  { href: "/shipping-policy", label: "Shipping Policy" },
  { href: "/return-policy", label: "Return & Refund Policy" },
  { href: "/payment-policy", label: "Payment Policy" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
  { href: "/cookie-policy", label: "Cookie Policy" },
] as const;
