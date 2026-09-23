import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression coverage for a real bug found during Phase 8 live
 * verification: every mutating bundle action except createBundleAction
 * called revalidateBundlePaths() with NO arguments, so it only ever
 * revalidated "/dashboard" — never the actual bundle detail page the user
 * is looking at. The database write succeeded (confirmed live), but the
 * UI silently kept showing stale state (an unchecked checkbox, a stale
 * name, a stale item count) until a hard refresh. Root cause: the service
 * functions didn't return the bundle's project_id, so the action layer had
 * nothing to build the scoped path from. Fixed by having each service
 * function return { projectId }, and passing that (plus the already-known
 * bundleId) into revalidatePath. These tests assert the SCOPED path is
 * revalidated, not just that revalidatePath was called at all — a test
 * that only checked "was called" would have passed even with the bug.
 */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const requireUser = vi.fn(async () => ({ supabase: {}, user: { id: "55555555-5555-5555-5555-555555555555" } }));
vi.mock("@/lib/supabase/current-user", () => ({ requireUser }));

const renameBundle = vi.fn(async () => ({ projectId: "33333333-3333-3333-3333-333333333333" }));
const setBundleItem = vi.fn(async () => ({ projectId: "33333333-3333-3333-3333-333333333333" }));
const removeBundleItem = vi.fn(async () => ({ projectId: "33333333-3333-3333-3333-333333333333" }));
const generateBundleCover = vi.fn(async () => ({ projectId: "33333333-3333-3333-3333-333333333333" }));
const deleteBundle = vi.fn(async () => ({ projectId: "33333333-3333-3333-3333-333333333333" }));
const createBundle = vi.fn(async () => ({ bundleId: "11111111-1111-1111-1111-111111111111" }));
vi.mock("@/lib/bundles/bundle-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bundles/bundle-service")>("@/lib/bundles/bundle-service");
  return { ...actual, renameBundle, setBundleItem, removeBundleItem, generateBundleCover, deleteBundle, createBundle };
});

const { renameBundleAction, setBundleItemAction, removeBundleItemAction, generateBundleCoverAction, deleteBundleAction } = await import(
  "@/app/actions/bundles"
);

beforeEach(() => {
  revalidatePath.mockClear();
});

const BUNDLE_ID = "11111111-1111-1111-1111-111111111111";
const DESIGN_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const SCOPED_PATH = `/dashboard/products/${PROJECT_ID}/bundles/${BUNDLE_ID}`;

describe("bundle actions revalidate the actual bundle detail page, not just /dashboard", () => {
  it("renameBundleAction revalidates the scoped bundle detail path", async () => {
    await renameBundleAction({ id: BUNDLE_ID, name: "New name" });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("setBundleItemAction revalidates the scoped bundle detail path", async () => {
    await setBundleItemAction({ bundleId: BUNDLE_ID, designId: DESIGN_ID, includePng: true, includeSvg: false });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("removeBundleItemAction revalidates the scoped bundle detail path", async () => {
    await removeBundleItemAction({ bundleId: BUNDLE_ID, designId: DESIGN_ID });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("generateBundleCoverAction revalidates the scoped bundle detail path", async () => {
    await generateBundleCoverAction({ id: BUNDLE_ID });
    expect(revalidatePath).toHaveBeenCalledWith(SCOPED_PATH);
  });

  it("deleteBundleAction revalidates the scoped product bundle-list path", async () => {
    await deleteBundleAction({ id: BUNDLE_ID });
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/products/${PROJECT_ID}`);
  });
});
