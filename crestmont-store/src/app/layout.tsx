import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";

import { CartDrawer } from "@/components/cart/cart-drawer";
import { CartProvider } from "@/components/cart/cart-provider";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { business } from "@/config/business";
import { commerce } from "@/config/commerce";
import { buildCartCatalog } from "@/lib/cart-catalog";
import { jsonLdString } from "@/lib/json-ld";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap", weight: ["400", "500"], style: ["normal", "italic"] });

const defaultDescription = `${business.brandName} is an online store for practical home and everyday living products, with clear product details, secure checkout and straightforward policies.`;

export const metadata: Metadata = {
  metadataBase: new URL(business.siteUrl),
  title: { default: `${business.brandName} | Home & Everyday Living`, template: `%s | ${business.brandName}` },
  description: defaultDescription,
  applicationName: business.brandName,
  openGraph: { type: "website", siteName: business.brandName, title: business.brandName, description: defaultDescription, url: business.siteUrl, locale: "en_US" },
  twitter: { card: "summary_large_image", title: business.brandName, description: defaultDescription },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf7",
  width: "device-width",
  initialScale: 1,
};

const a = business.address;
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "OnlineStore",
  name: business.brandName,
  legalName: business.legalName,
  url: business.siteUrl,
  ...(business.supportEmail ? { email: business.supportEmail } : {}),
  ...(business.phone ? { telephone: business.phone } : {}),
  address: {
    "@type": "PostalAddress",
    streetAddress: `${a.line1}, ${a.line2}`,
    addressLocality: a.city,
    addressRegion: a.region,
    postalCode: a.postalCode,
    addressCountry: a.countryCode,
  },
  ...(business.social.length ? { sameAs: business.social.map((s) => s.url) } : {}),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-US" className={`${inter.variable} ${newsreader.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(organizationJsonLd) }} />
        <CartProvider catalog={buildCartCatalog()} maxPerLine={commerce.maxQuantityPerLine}>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
