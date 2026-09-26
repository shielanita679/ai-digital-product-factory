import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression coverage for the exact revalidatePath bug found live during
 * Phase 8 (see src/app/actions/bundles.test.ts) and re-confirmed for
 * listings in Phase 9 (src/app/actions/listings.test.ts) — proactively
 * applied here from the start: buildPackageAction/deletePackageAction must
 * revalidate the SCOPED bundle detail path, not just "/dashboard".
 */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const BUNDLE_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const PACKAGE_ID = "44444444-4444-4444-4444-444444444444";
const SCOPED_PATH = `/dashboard/products/${PROJECT_ID}/bundles/${BUNDLE_ID}`;

function makeSupabaseStub() {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            single: async () => {
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

// Phase 12: buildPackageAction/getPackageDownloadUrlAction now call
// enforceRateLimit()/AnalyticsService.track() internally, both of which
// create their own service-role client — mocked here purely so this test
// file makes ZERO real Supabase network calls (both functions fail
// safe/swallow when the client doesn't behave like a real one).
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));

const buildPackageFn = vi.fn(async () => ({ packageId: PACKAGE_ID }));
const deletePackageFn = vi.fn(async () => ({ projectId: PROJECT_ID, bundleId: BUNDLE_ID }));
const getPackageDownloadUrlFn = vi.fn(async () => ({ url: "https://signed.example/x.zip", filename: "x.zip" }));
const checkPackagePrerequisitesFn = vi.fn(async () => ({ ok: true, blocking: [], warnings: [] }));
vi.mock("@/lib/packages/package-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/packages/package-service")>("@/lib/packages/package-service");
  return {
    ...actual,
    buildPackage: buildPackageFn,
    deletePackage: deletePackageFn,
    getPackageDownloadUrl: getPackageDownloadUrlFn,
    checkPackagePrerequisites: checkPackagePrerequisitesFn,
  };
});

const { buildPackageAction, deletePackageAction, getPackageDownloadUrlAction, checkPackagePrerequisitesAction } = await import("@/app/actions/packages");

beforeEach(() => {
  revalidatePath.mockClear();
});

describe("package actions revalidate the actual bundle detail page, not just /dashboard", () => {
  it("buildPackageAction revalidates the scoped bundle detail path and /dashboard/downloads", async () => {
    await buildPackageAction({ bundleId: BUNDLE_ID, marketplace: "generic" });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/downloads");
  });

  it("deletePackageAction revalidates the scoped bundle detail path and /dashboard/downloads", async () => {
    await deletePackageAction({ id: PACKAGE_ID });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/downloads");
  });
});

describe("package actions propagate service errors as plain messages", () => {
  it("buildPackageAction surfaces a PackageServiceError message", async () => {
    const { PackageServiceError } = await import("@/lib/packages/package-service");
    buildPackageFn.mockRejectedValueOnce(new PackageServiceError("Select at least one bundle item.", "asset_missing"));
    const result = await buildPackageAction({ bundleId: BUNDLE_ID, marketplace: "generic" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Select at least one bundle item.");
  });

  it("getPackageDownloadUrlAction returns the signed url and filename on success", async () => {
    const result = await getPackageDownloadUrlAction({ id: PACKAGE_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.filename).toBe("x.zip");
  });

  it("checkPackagePrerequisitesAction returns the prerequisite check payload", async () => {
    const result = await checkPackagePrerequisitesAction({ bundleId: BUNDLE_ID, marketplace: "etsy" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ ok: true, blocking: [], warnings: [] });
  });
});
