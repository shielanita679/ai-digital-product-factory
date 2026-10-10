import Link from "next/link";

import { Logo } from "@/components/logo";
import { addressLines, business } from "@/config/business";
import { footerNav } from "@/config/navigation";

function Column({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="eyebrow">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-ink-2 hover:text-ink hover:underline hover:underline-offset-4">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="page-x grid gap-12 py-14 lg:grid-cols-12 lg:py-16">
        <div className="lg:col-span-5">
          <Logo />
          <address className="mt-6 text-sm leading-6 text-ink-2 not-italic">
            <span className="font-medium text-ink">{business.legalName}</span>
            {addressLines().map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </address>
          {business.supportEmail && (
            <p className="mt-4 text-sm">
              <a href={`mailto:${business.supportEmail}`} className="link">{business.supportEmail}</a>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-6 lg:col-start-7">
          <Column title="Shop" links={footerNav.shop} />
          <Column title="Help" links={footerNav.help} />
          <Column title="Company" links={footerNav.company} />
        </div>
      </div>
      <div className="border-t border-line">
        <div className="page-x flex flex-col gap-2 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 {business.legalName}. All rights reserved.</p>
          <p>A {business.address.regionName} limited liability company.</p>
        </div>
      </div>
    </footer>
  );
}
