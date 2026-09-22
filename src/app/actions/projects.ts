"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/supabase/current-user";
import { friendlyDbErrorMessage } from "@/lib/supabase/db-error";
import {
  createProjectSchema,
  renameProjectSchema,
  projectIdSchema,
  setProjectArchivedSchema,
} from "@/lib/validations/project";
import type { Project } from "@/types/supabase";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function firstIssueMessage(error: { issues: { message: string }[] }, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

function revalidateProductPaths(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  if (id) revalidatePath(`/dashboard/products/${id}`);
}

export async function createProjectAction(
  input: unknown,
): Promise<ActionResult<Project>> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid input") };
  }

  const { supabase, user } = await requireUser();

  // user_id always comes from the server-verified session, never from the
  // client payload — RLS also enforces this independently.
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      product_type: parsed.data.productType,
    })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, error: friendlyDbErrorMessage(error, "Could not create the product.") };
  }

  revalidateProductPaths();
  return { ok: true, data };
}

export async function renameProjectAction(input: unknown): Promise<ActionResult> {
  const parsed = renameProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid input") };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("projects")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: friendlyDbErrorMessage(error, "Could not rename the product.") };
  }

  revalidateProductPaths(parsed.data.id);
  return { ok: true, data: undefined };
}

export async function duplicateProjectAction(
  input: unknown,
): Promise<ActionResult<Project>> {
  const parsed = projectIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid project") };
  }

  const { supabase, user } = await requireUser();

  const { data: original, error: fetchError } = await supabase
    .from("projects")
    .select("name, product_type")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !original) {
    return { ok: false, error: friendlyDbErrorMessage(fetchError, "Product not found.") };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: `${original.name} (Copy)`.slice(0, 80),
      product_type: original.product_type,
    })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, error: friendlyDbErrorMessage(error, "Could not duplicate the product.") };
  }

  revalidateProductPaths();
  return { ok: true, data };
}

export async function setProjectArchivedAction(input: unknown): Promise<ActionResult> {
  const parsed = setProjectArchivedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid input") };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("projects")
    .update({ archived: parsed.data.archived })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: friendlyDbErrorMessage(error, "Could not update the product.") };
  }

  revalidateProductPaths(parsed.data.id);
  return { ok: true, data: undefined };
}

export async function deleteProjectAction(input: unknown): Promise<ActionResult> {
  const parsed = projectIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error, "Invalid project") };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: friendlyDbErrorMessage(error, "Could not delete the product.") };
  }

  revalidateProductPaths();
  return { ok: true, data: undefined };
}
