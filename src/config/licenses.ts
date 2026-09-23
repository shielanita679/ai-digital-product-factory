/** Must match the `license_type` check constraint in supabase/migrations. */
export const LICENSE_TYPE_VALUES = ["personal", "commercial", "extended_commercial"] as const;
export type LicenseType = (typeof LICENSE_TYPE_VALUES)[number];

export const licenseTypeOptions: { value: LicenseType; label: string; summary: string }[] = [
  {
    value: "personal",
    label: "Personal Use",
    summary: "Personal projects only — no resale of the source files.",
  },
  {
    value: "commercial",
    label: "Commercial Use",
    summary: "Use in permitted end products you sell — no redistribution of the source files themselves.",
  },
  {
    value: "extended_commercial",
    label: "Extended Commercial Use",
    summary: "Broader commercial usage under this app's extended template — for larger runs, teams, or client work.",
  },
];

export function licenseTypeLabel(licenseType: string): string {
  return licenseTypeOptions.find((l) => l.value === licenseType)?.label ?? licenseType;
}

export type LicenseTemplateContext = {
  bundleName: string;
  productType: string;
};

const LEGAL_DISCLAIMER =
  "This is a customizable template, not legal advice. You are responsible for " +
  "reviewing and adjusting these terms so they fit your business and comply " +
  "with the laws of your jurisdiction before using them with real customers.";

/**
 * Centralized license template generation — the single place license
 * wording lives, so LicenseService (and nothing else) is responsible for
 * turning a license_type + bundle context into license_text. Deterministic
 * string composition only, no provider call: license text is a legal
 * document, not creative copy, and should never vary between two
 * generations of the same license type for the same bundle.
 */
export function generateLicenseTemplate(licenseType: LicenseType, context: LicenseTemplateContext): string {
  const { bundleName, productType } = context;

  const header = `LICENSE — ${bundleName}\n\n${LEGAL_DISCLAIMER}\n`;

  if (licenseType === "personal") {
    return (
      `${header}\n` +
      `PERSONAL USE LICENSE\n\n` +
      `This license grants the buyer the right to use "${bundleName}" (${productType}) for personal, ` +
      `non-commercial projects only.\n\n` +
      `Permitted:\n` +
      `- Personal projects (crafts, gifts, personal social media, personal printables).\n` +
      `- Modifying the files for your own personal use.\n\n` +
      `Not permitted:\n` +
      `- Resale or redistribution of the source digital files, as-is or modified.\n` +
      `- Use in any product or project intended for sale or commercial gain.\n` +
      `- Claiming the original design work as your own.\n\n` +
      `This license does not transfer ownership of the underlying design work — only the right ` +
      `to use it personally as described above.`
    );
  }

  if (licenseType === "commercial") {
    return (
      `${header}\n` +
      `COMMERCIAL USE LICENSE\n\n` +
      `This license grants the buyer the right to use "${bundleName}" (${productType}) in end products ` +
      `they sell, subject to the terms below.\n\n` +
      `Permitted:\n` +
      `- Using the files to create end products (physical or digital) that you sell to customers.\n` +
      `- Small-business commercial use, including print-on-demand end products made from these files.\n\n` +
      `Not permitted:\n` +
      `- Redistribution or resale of the source digital files themselves, as-is or repackaged.\n` +
      `- Sublicensing the source files to a third party.\n` +
      `- Use in a design tool, template marketplace, or product that primarily re-sells the source files.\n\n` +
      `This license covers a single seller/business using the files in their own end products. It does ` +
      `not transfer ownership of the underlying design work.`
    );
  }

  return (
    `${header}\n` +
    `EXTENDED COMMERCIAL USE LICENSE\n\n` +
    `This license grants the buyer broader commercial usage rights for "${bundleName}" (${productType}) ` +
    `beyond the standard Commercial Use license, under this application's extended template.\n\n` +
    `Permitted:\n` +
    `- Everything covered under the standard Commercial Use license.\n` +
    `- Use across a larger production run, multiple product lines, or a small team/agency working on ` +
    `the buyer's behalf.\n` +
    `- Use in client work, where the end product is delivered to the buyer's own client.\n\n` +
    `Not permitted:\n` +
    `- Redistribution or resale of the source digital files themselves, as-is or repackaged.\n` +
    `- Sublicensing the source files to a third party as a stand-alone digital product.\n` +
    `- Presenting the extended license as unlimited — specific run/seat limits are the seller's to define ` +
    `and state explicitly if they need one.\n\n` +
    `This license does not transfer ownership of the underlying design work. Sellers offering this tier ` +
    `should clearly state any additional limits (e.g. team size, unit cap) alongside this template.`
  );
}
