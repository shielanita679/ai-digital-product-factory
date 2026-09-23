import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression coverage for the same revalidatePath bug documented in
 * src/app/actions/bundles.test.ts — mockups.ts had the identical bug: its
 * revalidateMockupPaths() also took no arguments and only ever revalidated
 * "/dashboard", so generating or deleting a mockup never refreshed the
 * bundle detail page the user was looking at, even though the underlying
 * mockup row was created/updated/deleted correctly.
 */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const requireUser = vi.fn(async () => ({ supabase: {}, user: { id: "55555555-5555-5555-5555-555555555555" } }));
vi.mock("@/lib/supabase/current-user", () => ({ requireUser }));

const generateMockups = vi.fn(async () => ({ results: [], projectId: "33333333-3333-3333-3333-333333333333" }));
const deleteMockup = vi.fn(async () => ({ projectId: "33333333-3333-3333-3333-333333333333", bundleId: "11111111-1111-1111-1111-111111111111" }));
const getMockupDownloadUrl = vi.fn(async () => ({ url: "https://example.com/x", filename: "x.png" }));
vi.mock("@/lib/bundles/mockup-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bundles/mockup-service")>("@/lib/bundles/mockup-service");
  return { ...actual, generateMockups, deleteMockup, getMockupDownloadUrl };
});

const { generateMockupsAction, deleteMockupAction } = await import("@/app/actions/mockups");

beforeEach(() => {
  revalidatePath.mockClear();
});

const BUNDLE_ID = "11111111-1111-1111-1111-111111111111";
const DESIGN_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const MOCKUP_ID = "44444444-4444-4444-4444-444444444444";
const SCOPED_PATH = `/dashboard/products/${PROJECT_ID}/bundles/${BUNDLE_ID}`;

describe("mockup actions revalidate the actual bundle detail page, not just /dashboard", () => {
  it("generateMockupsAction revalidates the scoped bundle detail path", async () => {
    await generateMockupsAction({ bundleId: BUNDLE_ID, designId: DESIGN_ID, templateTypes: ["tshirt"] });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("deleteMockupAction revalidates the scoped bundle detail path", async () => {
    await deleteMockupAction({ id: MOCKUP_ID });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });
});
