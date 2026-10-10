import Link from "next/link";

import { addressLines, business } from "@/config/business";
import { policyPages } from "@/config/navigation";

import { Breadcrumbs } from "./breadcrumbs";

const updated = new Date(`${business.policiesLastUpdated}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export function PolicyLayout({ title, path, intro, children }: { title: string; path: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="page-x py-10 sm:py-14">
      <Breadcrumbs items={[{ label: title, href: path }]} />
      <div className="mt-6 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <h1 className="text-4xl sm:text-5xl">{title}</h1>
          <p className="mt-3 text-[0.8125rem] text-muted">Last updated {updated}</p>
          {intro && <div className="prose-store mt-6">{intro}</div>}
          <div className="prose-store mt-10">{children}</div>
        </div>
        <aside className="lg:col-span-3 lg:col-start-10">
          <div className="space-y-8 lg:sticky lg:top-28">
            <nav aria-label="Policies">
              <h2 className="eyebrow">Policies</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {policyPages.map((p) => (
                  <li key={p.href}>
                    {p.href === path ? (
                      <span aria-current="page" className="font-medium text-ink">{p.label}</span>
                    ) : (
                      <Link href={p.href} className="text-ink-2 hover:text-ink hover:underline hover:underline-offset-4">{p.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
            <div className="text-sm text-ink-2">
              <h2 className="eyebrow">Questions</h2>
              <p className="mt-3">
                <Link href="/contact" className="link">Contact customer support</Link>
                {business.supportEmail && (
                  <>
                    {" "}or email <a href={`mailto:${business.supportEmail}`} className="link break-all">{business.supportEmail}</a>
                  </>
                )}
                .
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Standard "Contact us" block used at the end of every policy. */
export function PolicyContact({ email }: { email?: string | null }) {
  const address = email ?? business.supportEmail;
  return (
    <>
      <p>If you have questions about this policy, contact us:</p>
      <address className="not-italic">
        <strong>{business.legalName}</strong>
        {addressLines().map((l) => (
          <span key={l} className="block">{l}</span>
        ))}
        {address && (
          <span className="mt-2 block">
            Email: <a href={`mailto:${address}`}>{address}</a>
          </span>
        )}
        <span className="mt-2 block">
          Online: <Link href="/contact">contact form</Link>
        </span>
      </address>
    </>
  );
}
