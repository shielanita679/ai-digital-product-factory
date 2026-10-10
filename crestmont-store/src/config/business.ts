/**
 * Single source of truth for the company's legal and contact details.
 *
 * Every page, policy, footer, email and structured-data block reads from
 * here. Do not type the company name, address or support email anywhere
 * else in the codebase.
 */

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Hostname without "www.", e.g. "your-domain.com". Null until NEXT_PUBLIC_SITE_URL is set. */
function resolveDomain(): string | null {
  if (!process.env.NEXT_PUBLIC_SITE_URL) return null;
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const domain = resolveDomain();

export const business = {
  /** Customer-facing brand name. */
  brandName: "CRESTMONT HOLDINGS",
  /** Exact legal entity name — use in legal and business contexts. */
  legalName: "CRESTMONT HOLDINGS LLC",
  entityType: "Limited Liability Company",
  stateOfFormation: "Missouri",
  countryOfFormation: "United States",

  address: {
    line1: "231 S Bemiston Ave",
    line2: "Ste 850 PMB 332707",
    city: "Saint Louis",
    region: "MO",
    regionName: "Missouri",
    postalCode: "63105",
    country: "United States",
    countryCode: "US",
  },

  siteUrl,
  domain,

  /**
   * Customer-support mailbox. Defaults to support@<your domain> once
   * NEXT_PUBLIC_SITE_URL is set; override here if you use a different
   * mailbox. It must be a real, monitored inbox before launch.
   */
  supportEmail: domain ? `support@${domain}` : null as string | null,
  /** Mailbox for privacy/data requests. Defaults to the support inbox. */
  privacyEmail: null as string | null,

  /** Public phone number, if you offer phone support. Leave null otherwise. */
  phone: null as string | null,

  /**
   * Hours during which support emails are answered, e.g.
   * "Monday–Friday, 9:00 a.m.–5:00 p.m. Central Time". Leave null until set.
   */
  supportHours: null as string | null,

  /**
   * Typical reply time you can reliably meet, e.g. "within 1–2 business days".
   * Only fill this in if you can consistently meet it.
   */
  supportResponseTime: null as string | null,

  /** Effective date shown on every policy page. Update when policies change. */
  policiesLastUpdated: "2026-10-10",

  /** Public social profiles (real accounts only). */
  social: [] as { label: string; url: string }[],
} as const;

export function privacyContactEmail(): string | null {
  return business.privacyEmail ?? business.supportEmail;
}

/** The registered address as display lines. */
export function addressLines(): string[] {
  const a = business.address;
  return [a.line1, a.line2, `${a.city}, ${a.region} ${a.postalCode}`, a.country];
}

export function absoluteUrl(path = "/"): string {
  return `${business.siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
