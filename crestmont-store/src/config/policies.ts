/**
 * Settings shared by the legal and policy pages.
 *
 * `effectiveDate` is the single "Last updated" date shown on every policy
 * page. It stays null during pre-launch — pages then show a pre-launch
 * notice — and must be set to the actual launch date (YYYY-MM-DD) before
 * the store opens. `npm run check:launch` reports it while unset.
 *
 * These policies have not been reviewed by an attorney; do not state
 * otherwise anywhere on the site.
 */
export const policies = {
  effectiveDate: null as string | null,
  minimumBuyerAge: 18,
  governingLaw: { state: "Missouri", country: "United States" },
} as const;

export function formatPolicyDate(): string | null {
  if (!policies.effectiveDate) return null;
  return new Date(`${policies.effectiveDate}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
