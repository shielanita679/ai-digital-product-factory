import type { Metadata } from "next";
import Link from "next/link";

import { BoxIcon, MailIcon, ReturnIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Account", description: "Order help, tracking and returns.", path: "/account" }),
  robots: { index: false, follow: true },
};

export default function AccountPage() {
  return (
    <>
      <PageHeader
        title="Your account"
        crumbs={[{ label: "Account", href: "/account" }]}
        intro={
          <p>
            We currently offer guest checkout only, so there&rsquo;s no password to create or remember. Your order confirmation and receipt are sent to the email address you use at checkout, and everything you need to manage an order is below.
          </p>
        }
      />
      <div className="page-x grid gap-6 py-12 sm:grid-cols-3 sm:py-16">
        {[
          { icon: <BoxIcon />, title: "Track an order", body: "Check on an order using your order number and email.", href: "/order-tracking", cta: "Order tracking" },
          { icon: <ReturnIcon />, title: "Start a return", body: "Read the return terms, then contact us to begin.", href: "/return-policy", cta: "Return policy" },
          { icon: <MailIcon />, title: "Get help", body: "Questions about an order, product or delivery.", href: "/contact", cta: "Contact us" },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="group border border-line p-6 transition-colors hover:border-ink">
            {c.icon}
            <h2 className="mt-4 font-sans text-base font-semibold">{c.title}</h2>
            <p className="mt-1.5 text-sm text-ink-2">{c.body}</p>
            <span className="mt-4 inline-block text-sm underline underline-offset-4">{c.cta}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
