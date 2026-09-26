"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import { generateListing, regenerateListingSection, updateListing, ListingServiceError } from "@/lib/listings/listing-service";
import { generateLicense, updateLicenseText, resetLicenseTemplate, LicenseServiceError } from "@/lib/listings/license-service";
import {
  generateListingSchema,
  regenerateSectionSchema,
  updateListingSchema,
  generateLicenseSchema,
  updateLicenseTextSchema,
  resetLicenseSchema,
} from "@/lib/validations/listing";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit/rate-limiter";
import type { ActionResult } from "@/app/actions/projects";

function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

// Phase 8 lesson (found live): revalidatePath must always be called with
// the ACTUAL scoped path the user is looking at — the bundle detail page
// — never just "/dashboard". Calling it with no path argument silently
// leaves the page stale until a manual reload, even though the database
// write succeeds. Every action below revalidates the bundle detail path.
function revalidateListingPaths(projectId?: string, bundleId?: string) {
  revalidatePath("/dashboard");
  if (projectId) revalidatePath(`/dashboard/products/${projectId}`);
  if (projectId && bundleId) revalidatePath(`/dashboard/products/${projectId}/bundles/${bundleId}`);
}

export type GenerateListingActionResult = ActionResult<{ listingId: string }> | { ok: false; error: string; code: "edit_protected" };

export async function generateListingAction(input: unknown): Promise<GenerateListingActionResult> {
  const parsed = generateListingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await enforceRateLimit(user.id, "listing_generation");
    const result = await generateListing({ supabase, userId: user.id }, parsed.data.bundleId, parsed.data.marketplace, {
      confirmOverwriteEdits: parsed.data.confirmOverwriteEdits,
    });
    const { data: bundle } = await supabase.from("product_bundles").select("project_id").eq("id", parsed.data.bundleId).single();
    revalidateListingPaths(bundle?.project_id, parsed.data.bundleId);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    if (err instanceof ListingServiceError) {
      if (err.code === "edit_protected") return { ok: false, error: err.message, code: "edit_protected" };
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not generate the listing. Please try again." };
  }
}

export type RegenerateSectionActionResult = ActionResult | { ok: false; error: string; code: "edit_protected" };

export async function regenerateListingSectionAction(input: unknown): Promise<RegenerateSectionActionResult> {
  const parsed = regenerateSectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await enforceRateLimit(user.id, "listing_generation");
    const { data: listing } = await supabase.from("product_listings").select("bundle_id").eq("id", parsed.data.id).single();
    await regenerateListingSection({ supabase, userId: user.id }, parsed.data.id, parsed.data.section, {
      confirmOverwriteEdits: parsed.data.confirmOverwriteEdits,
    });
    const { data: bundle } = listing ? await supabase.from("product_bundles").select("project_id").eq("id", listing.bundle_id).single() : { data: null };
    revalidateListingPaths(bundle?.project_id, listing?.bundle_id);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    if (err instanceof ListingServiceError) {
      if (err.code === "edit_protected") return { ok: false, error: err.message, code: "edit_protected" };
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not regenerate that section. Please try again." };
  }
}

export async function updateListingAction(input: unknown): Promise<ActionResult> {
  const parsed = updateListingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const { data: listing } = await supabase.from("product_listings").select("bundle_id").eq("id", parsed.data.id).single();
    await updateListing({ supabase, userId: user.id }, parsed.data.id, {
      title: parsed.data.title,
      description: parsed.data.description,
      tags: parsed.data.tags,
      seoKeywords: parsed.data.seoKeywords,
    });
    const { data: bundle } = listing ? await supabase.from("product_bundles").select("project_id").eq("id", listing.bundle_id).single() : { data: null };
    revalidateListingPaths(bundle?.project_id, listing?.bundle_id);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof ListingServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not save your changes. Please try again." };
  }
}

export type GenerateLicenseActionResult = ActionResult | { ok: false; error: string; code: "edit_protected" };

export async function generateLicenseAction(input: unknown): Promise<GenerateLicenseActionResult> {
  const parsed = generateLicenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    await enforceRateLimit(user.id, "listing_generation");
    const { data: listing } = await supabase.from("product_listings").select("bundle_id").eq("id", parsed.data.id).single();
    await generateLicense({ supabase, userId: user.id }, parsed.data.id, parsed.data.licenseType, {
      confirmOverwriteEdits: parsed.data.confirmOverwriteEdits,
    });
    const { data: bundle } = listing ? await supabase.from("product_bundles").select("project_id").eq("id", listing.bundle_id).single() : { data: null };
    revalidateListingPaths(bundle?.project_id, listing?.bundle_id);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    if (err instanceof LicenseServiceError) {
      if (err.code === "edit_protected") return { ok: false, error: err.message, code: "edit_protected" };
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Could not generate the license. Please try again." };
  }
}

export async function updateLicenseTextAction(input: unknown): Promise<ActionResult> {
  const parsed = updateLicenseTextSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const { data: listing } = await supabase.from("product_listings").select("bundle_id").eq("id", parsed.data.id).single();
    await updateLicenseText({ supabase, userId: user.id }, parsed.data.id, parsed.data.licenseText);
    const { data: bundle } = listing ? await supabase.from("product_bundles").select("project_id").eq("id", listing.bundle_id).single() : { data: null };
    revalidateListingPaths(bundle?.project_id, listing?.bundle_id);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof LicenseServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not save the license text. Please try again." };
  }
}

export async function resetLicenseAction(input: unknown): Promise<ActionResult> {
  const parsed = resetLicenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssueMessage(parsed.error, "Invalid request.") };

  const { supabase, user } = await requireUser();
  try {
    const { data: listing } = await supabase.from("product_listings").select("bundle_id").eq("id", parsed.data.id).single();
    await resetLicenseTemplate({ supabase, userId: user.id }, parsed.data.id);
    const { data: bundle } = listing ? await supabase.from("product_bundles").select("project_id").eq("id", listing.bundle_id).single() : { data: null };
    revalidateListingPaths(bundle?.project_id, listing?.bundle_id);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof LicenseServiceError) return { ok: false, error: err.message };
    return { ok: false, error: "Could not reset the license. Please try again." };
  }
}
