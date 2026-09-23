import { describe, it, expect } from "vitest";

import {
  pickDefaultMarketplace,
  licenseTypeToRestoreOnDismiss,
} from "@/components/listings/listing-license-section";

/**
 * Regression coverage for a real bug found during Phase 9 live
 * verification: Postgres/PostgREST give no row-order guarantee without an
 * explicit ORDER BY. Querying product_listings for a bundle with both a
 * 'generic' and an 'etsy' row came back with 'etsy' FIRST despite being
 * created LATER — confirmed live. The component originally defaulted its
 * marketplace selector to `listings[0]?.marketplace`, so which tab a user
 * landed on after a reload was effectively random. Fixed by always
 * preferring 'generic' (the schema's own default marketplace) when it's
 * present, regardless of array order.
 */
describe("pickDefaultMarketplace", () => {
  it("prefers 'generic' even when it is NOT first in the array (the exact live bug shape)", () => {
    const listings = [{ marketplace: "etsy" }, { marketplace: "generic" }];
    expect(pickDefaultMarketplace(listings)).toBe("generic");
  });

  it("prefers 'generic' when it IS first too", () => {
    const listings = [{ marketplace: "generic" }, { marketplace: "etsy" }];
    expect(pickDefaultMarketplace(listings)).toBe("generic");
  });

  it("falls back to whatever is present when there is no 'generic' listing", () => {
    const listings = [{ marketplace: "etsy" }];
    expect(pickDefaultMarketplace(listings)).toBe("etsy");
  });

  it("defaults to 'generic' when there are no listings at all", () => {
    expect(pickDefaultMarketplace([])).toBe("generic");
  });
});

/**
 * Regression coverage for a real bug found during Phase 9 live
 * verification: the license-type <select>'s onChange handler calls
 * setLicenseType(nextType) optimistically, before the server confirms the
 * change. When that change is edit-protected and the user cancels (or
 * dismisses via Escape/backdrop) the "overwrite manually edited content?"
 * dialog, the underlying license_type row was never touched — but the
 * dropdown was left showing the cancelled selection instead of the actual
 * persisted type. Confirmed live: after selecting a new type on a
 * hand-edited license and cancelling, the <select> kept showing the
 * cancelled type even though the database row (and the license text)
 * never changed. Fixed by reverting `licenseType` to the listing's real
 * persisted value whenever the confirm dialog is dismissed without
 * confirming.
 */
describe("licenseTypeToRestoreOnDismiss", () => {
  it("restores the persisted type when a license-type confirm is dismissed (the exact live bug shape)", () => {
    const pendingConfirm = { kind: "license" as const, licenseType: "personal" as const };
    expect(licenseTypeToRestoreOnDismiss(pendingConfirm, "extended_commercial")).toBe(
      "extended_commercial",
    );
  });

  it("restores to empty string when the listing has no persisted license type yet", () => {
    const pendingConfirm = { kind: "license" as const, licenseType: "personal" as const };
    expect(licenseTypeToRestoreOnDismiss(pendingConfirm, null)).toBe("");
    expect(licenseTypeToRestoreOnDismiss(pendingConfirm, undefined)).toBe("");
  });

  it("does nothing (returns null) for a listing or section confirm dismissal", () => {
    expect(licenseTypeToRestoreOnDismiss({ kind: "listing" }, "extended_commercial")).toBeNull();
    expect(
      licenseTypeToRestoreOnDismiss({ kind: "section", section: "title" }, "extended_commercial"),
    ).toBeNull();
  });

  it("does nothing (returns null) when there is no pending confirm at all", () => {
    expect(licenseTypeToRestoreOnDismiss(null, "extended_commercial")).toBeNull();
  });
});
