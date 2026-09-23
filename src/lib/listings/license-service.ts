import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ProductListing } from "@/types/supabase";
import { friendlyDbErrorMessage, isMigrationNotAppliedError } from "@/lib/supabase/db-error";
import { generateLicenseTemplate, type LicenseType } from "@/config/licenses";
import { productTypeLabel } from "@/config/product-types";

export type LicenseContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

export type LicenseServiceErrorCode = "not_found" | "invalid_config" | "edit_protected" | "db_error" | "migration_not_applied";

export class LicenseServiceError extends Error {
  readonly code: LicenseServiceErrorCode;
  constructor(message: string, code: LicenseServiceErrorCode) {
    super(message);
    this.name = "LicenseServiceError";
    this.code = code;
  }
}

async function loadOwnedListing(ctx: LicenseContext, listingId: string): Promise<ProductListing> {
  const { data, error } = await ctx.supabase.from("product_listings").select("*").eq("id", listingId).eq("user_id", ctx.userId).single();
  if (error || !data) {
    if (isMigrationNotAppliedError(error)) {
      throw new LicenseServiceError(friendlyDbErrorMessage(error, "Could not load the listing."), "migration_not_applied");
    }
    throw new LicenseServiceError("Listing not found.", "not_found");
  }
  return data;
}

async function loadBundleNameAndProductType(ctx: LicenseContext, bundleId: string): Promise<{ bundleName: string; productType: string }> {
  const { data: bundle, error: bundleError } = await ctx.supabase.from("product_bundles").select("name, project_id").eq("id", bundleId).eq("user_id", ctx.userId).single();
  if (bundleError || !bundle) {
    throw new LicenseServiceError("Bundle not found.", "not_found");
  }
  const { data: project } = await ctx.supabase.from("projects").select("product_type").eq("id", bundle.project_id).eq("user_id", ctx.userId).single();
  return { bundleName: bundle.name, productType: project ? productTypeLabel(project.product_type) : "digital product" };
}

export type GenerateLicenseOptions = { confirmOverwriteEdits?: boolean };

/**
 * Generates license text from the centralized template
 * (src/config/licenses.ts) for the given license_type. If the listing
 * already has manually-edited license text and the caller is switching to
 * a DIFFERENT license_type (or otherwise didn't pass
 * confirmOverwriteEdits), this throws ("edit_protected") rather than
 * silently discarding the seller's hand-edited terms.
 */
export async function generateLicense(ctx: LicenseContext, listingId: string, licenseType: LicenseType, options: GenerateLicenseOptions = {}): Promise<void> {
  const listing = await loadOwnedListing(ctx, listingId);

  if (listing.license_edited && listing.license_text && !options.confirmOverwriteEdits) {
    throw new LicenseServiceError(
      "This license has been manually edited. Generating a new template will overwrite it — confirm to continue.",
      "edit_protected",
    );
  }

  const { bundleName, productType } = await loadBundleNameAndProductType(ctx, listing.bundle_id);
  const licenseText = generateLicenseTemplate(licenseType, { bundleName, productType });

  const { error } = await ctx.supabase
    .from("product_listings")
    .update({ license_type: licenseType, license_text: licenseText, license_edited: false })
    .eq("id", listingId)
    .eq("user_id", ctx.userId);
  if (error) throw new LicenseServiceError(friendlyDbErrorMessage(error, "Could not save the license."), "db_error");
}

/** Persists a manual edit to the license text — marks it edited so a future generateLicense() call requires confirmation before overwriting it. */
export async function updateLicenseText(ctx: LicenseContext, listingId: string, licenseText: string): Promise<void> {
  await loadOwnedListing(ctx, listingId);
  const { error } = await ctx.supabase
    .from("product_listings")
    .update({ license_text: licenseText.trim(), license_edited: true })
    .eq("id", listingId)
    .eq("user_id", ctx.userId);
  if (error) throw new LicenseServiceError(friendlyDbErrorMessage(error, "Could not save the license text."), "db_error");
}

/**
 * "Reset License Template" — the one explicit, always-allowed action that
 * regenerates the CURRENT license_type's template text and discards any
 * manual edits. Being explicit and separately labeled in the UI (never
 * triggered implicitly by anything else) is what makes it safe to run
 * without a confirmOverwriteEdits gate: choosing "reset" IS the
 * confirmation.
 */
export async function resetLicenseTemplate(ctx: LicenseContext, listingId: string): Promise<void> {
  const listing = await loadOwnedListing(ctx, listingId);
  if (!listing.license_type) {
    throw new LicenseServiceError("Select a license type before resetting to the template.", "invalid_config");
  }
  const { bundleName, productType } = await loadBundleNameAndProductType(ctx, listing.bundle_id);
  const licenseText = generateLicenseTemplate(listing.license_type as LicenseType, { bundleName, productType });

  const { error } = await ctx.supabase
    .from("product_listings")
    .update({ license_text: licenseText, license_edited: false })
    .eq("id", listingId)
    .eq("user_id", ctx.userId);
  if (error) throw new LicenseServiceError(friendlyDbErrorMessage(error, "Could not reset the license."), "db_error");
}
