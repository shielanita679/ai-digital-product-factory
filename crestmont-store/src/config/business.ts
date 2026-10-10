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
   * Customer-support mailbox, from the SUPPORT_EMAIL environment variable.
   * It must be a real, monitored inbox on the store's own domain. Never
   * derive or guess it. Set at build time (it is rendered into pages).
   */
  supportEmail: (process.env.SUPPORT_EMAIL?.trim() || null) as string | null,
  /** Mailbox for privacy/data requests. Defaults to the support inbox. */
  privacyEmail: null as string | null,

  /** Public phone number, if phone support is offered. None at launch. */
  phone: null as string | null,

  /** Customer-support availability (when messages are answered). */
  supportHours: "Monday–Friday, 9:00 a.m.–5:00 p.m. Central Time" as string | null,

  /** Target time for a first response — not a guarantee that every issue is resolved in that time. */
  supportResponseTime: "within 2 business days" as string | null,

  /** Public social profiles (real accounts only). */
  social: [] as { label: string; url: string }[],
} as const;

/**
 * Support schedule for public display. Returned only once a real support
 * inbox and production domain are configured, so the site never advertises
 * availability for a support channel that doesn't exist yet.
 */
export function publicSupportSchedule(): { hours: string; responseTime: string } | null {
  if (!business.supportEmail || !business.domain || !business.supportHours || !business.supportResponseTime) return null;
  return { hours: business.supportHours, responseTime: business.supportResponseTime };
}

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
