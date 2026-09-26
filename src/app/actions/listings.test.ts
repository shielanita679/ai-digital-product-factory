import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression coverage for the exact revalidatePath bug found live during
 * Phase 8 (see src/app/actions/bundles.test.ts) — proactively applied
 * here from the start: every mutating listing/license action must
 * revalidate the SCOPED bundle detail path, not just "/dashboard".
 */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const BUNDLE_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const LISTING_ID = "44444444-4444-4444-4444-444444444444";
const SCOPED_PATH = `/dashboard/products/${PROJECT_ID}/bundles/${BUNDLE_ID}`;

function makeSupabaseStub() {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            single: async () => {
              if (table === "product_listings") return { data: { bundle_id: BUNDLE_ID }, error: null };
              if (table === "product_bundles") return { data: { project_id: PROJECT_ID }, error: null };
              return { data: null, error: null };
            },
          }),
        }),
      };
    },
  };
}

const requireUser = vi.fn(async () => ({ supabase: makeSupabaseStub(), user: { id: "55555555-5555-5555-5555-555555555555" } }));
vi.mock("@/lib/supabase/current-user", () => ({ requireUser }));

// Phase 12: generateListingAction/generateLicenseAction now call
// enforceRateLimit()/AnalyticsService.track() internally, both of which
// create their own service-role client — mocked here purely so this test
// file makes ZERO real Supabase network calls (both functions already
// fail safe/swallow when the client doesn't behave like a real one; see
// their own doc comments).
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));

const generateListing = vi.fn(async () => ({ listingId: LISTING_ID }));
const regenerateListingSectionFn = vi.fn(async () => undefined);
const updateListingFn = vi.fn(async () => undefined);
vi.mock("@/lib/listings/listing-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/listings/listing-service")>("@/lib/listings/listing-service");
  return { ...actual, generateListing, regenerateListingSection: regenerateListingSectionFn, updateListing: updateListingFn };
});

const generateLicenseFn = vi.fn(async () => undefined);
const updateLicenseTextFn = vi.fn(async () => undefined);
const resetLicenseTemplateFn = vi.fn(async () => undefined);
vi.mock("@/lib/listings/license-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/listings/license-service")>("@/lib/listings/license-service");
  return { ...actual, generateLicense: generateLicenseFn, updateLicenseText: updateLicenseTextFn, resetLicenseTemplate: resetLicenseTemplateFn };
});

const { generateListingAction, regenerateListingSectionAction, updateListingAction, generateLicenseAction, updateLicenseTextAction, resetLicenseAction } =
  await import("@/app/actions/listings");

beforeEach(() => {
  revalidatePath.mockClear();
});

describe("listing/license actions revalidate the actual bundle detail page, not just /dashboard", () => {
  it("generateListingAction revalidates the scoped bundle detail path", async () => {
    await generateListingAction({ bundleId: BUNDLE_ID, marketplace: "generic" });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("regenerateListingSectionAction revalidates the scoped bundle detail path", async () => {
    await regenerateListingSectionAction({ id: LISTING_ID, section: "title" });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("updateListingAction revalidates the scoped bundle detail path", async () => {
    await updateListingAction({ id: LISTING_ID, title: "New title" });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("generateLicenseAction revalidates the scoped bundle detail path", async () => {
    await generateLicenseAction({ id: LISTING_ID, licenseType: "personal" });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("updateLicenseTextAction revalidates the scoped bundle detail path", async () => {
    await updateLicenseTextAction({ id: LISTING_ID, licenseText: "custom terms" });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("resetLicenseAction revalidates the scoped bundle detail path", async () => {
    await resetLicenseAction({ id: LISTING_ID });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });
});

describe("listing/license actions surface edit_protected as a distinct code, not a generic error", () => {
  it("generateListingAction propagates code: edit_protected", async () => {
    const { ListingServiceError } = await import("@/lib/listings/listing-service");
    generateListing.mockRejectedValueOnce(new ListingServiceError("edited", "edit_protected"));
    const result = await generateListingAction({ bundleId: BUNDLE_ID, marketplace: "generic" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect("code" in result && result.code).toBe("edit_protected");
  });

  it("generateLicenseAction propagates code: edit_protected", async () => {
    const { LicenseServiceError } = await import("@/lib/listings/license-service");
    generateLicenseFn.mockRejectedValueOnce(new LicenseServiceError("edited", "edit_protected"));
    const result = await generateLicenseAction({ id: LISTING_ID, licenseType: "commercial" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect("code" in result && result.code).toBe("edit_protected");
  });
});
