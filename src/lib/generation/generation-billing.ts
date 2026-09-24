import { randomUUID } from "node:crypto";

import type { GenerationContext } from "@/lib/generation/generation-service";
import { startGenerationJob, GenerationServiceError } from "@/lib/generation/generation-service";
import { getImageProvider } from "@/lib/ai/provider-registry";
import { applyOwnLedgerEntry, CreditServiceError } from "@/lib/credits/credit-service";
import { CREDIT_COSTS } from "@/config/credits";

/**
 * Credit-enforced wrapper around the UNMODIFIED startGenerationJob (Phase
 * 5). Deliberately a separate module rather than a change to
 * generation-service.ts itself: every one of that file's existing tests
 * calls startGenerationJob directly and keeps passing completely
 * unchanged, and this wrapper's own behavior is independently testable
 * with a controlled fake credit/generation double (Phase 11 spec section
 * 19 — never by actually calling OpenAI to test billing).
 *
 * MOCK PROVIDER: when AI_IMAGE_PROVIDER is "mock" (the default — used by
 * every existing test and normal local development), this delegates
 * straight to startGenerationJob with ZERO credit calls. Mock generation
 * costs nothing real and must not unexpectedly drain a developer's/
 * tester's credits (Phase 11 spec section 19). Credit enforcement only
 * engages once a real, paid provider is configured.
 *
 * MULTI-DESIGN SEMANTICS (Phase 11 spec section 18): reserves the FULL
 * requested amount (project.requested_design_count × cost) BEFORE calling
 * startGenerationJob — generation must not start at all if that reservation
 * fails on insufficient balance. After the (synchronous) job completes,
 * refunds credits for any design that did NOT complete
 * (requestedCount - completedCount), so the seller is charged for exactly
 * the successful outputs. This is recorded as a reserve (one debit) plus a
 * refund (one credit) — two ledger entries rather than a single
 * "adjusted" charge — which is a deliberately simpler, still fully
 * auditable design: the ledger shows exactly what was reserved and
 * exactly what came back, rather than requiring a reader to diff a
 * "before" and "after" charge amount.
 *
 * Idempotency: the initial reservation uses a fresh per-call token
 * (generation_reserve:{token}) since no job id exists yet at that point;
 * if startGenerationJob itself then fails (including its own
 * "job_already_active" double-click guard), the reservation is refunded
 * immediately under generation_reserve_refund:{token}. The FINAL
 * refund-of-unused-credits step, once a real job id exists, uses
 * generation_refund:{jobId} — matching the Phase 11 spec's own suggested
 * naming — so it can never double-refund even if this wrapper were ever
 * invoked twice for the same completed job.
 */
export async function startGenerationJobWithCredits(ctx: GenerationContext, projectId: string): Promise<{ jobId: string }> {
  const provider = getImageProvider();
  if (provider.name === "mock") {
    return startGenerationJob(ctx, projectId);
  }

  const { data: project, error: projectError } = await ctx.supabase.from("projects").select("requested_design_count").eq("id", projectId).eq("user_id", ctx.userId).single();
  if (projectError || !project) {
    throw new GenerationServiceError("Product not found.", "not_found");
  }

  const requestedCount = project.requested_design_count;
  const costPerImage = CREDIT_COSTS.imageGeneration;
  const reserveAmount = requestedCount * costPerImage;
  const reservationToken = randomUUID();

  if (reserveAmount > 0) {
    try {
      await applyOwnLedgerEntry(ctx, {
        amount: -reserveAmount,
        entryType: "generation_charge",
        reason: `Reserved for ${requestedCount} design generation${requestedCount === 1 ? "" : "s"}`,
        referenceType: "project",
        referenceId: projectId,
        idempotencyKey: `generation_reserve:${reservationToken}`,
      });
    } catch (err) {
      if (err instanceof CreditServiceError && err.code === "insufficient_credits") {
        const available = err.availableBalance ?? 0;
        throw new GenerationServiceError(`You need ${reserveAmount} credits but have ${available}.`, "insufficient_credits");
      }
      throw err;
    }
  }

  let jobId: string;
  try {
    const result = await startGenerationJob(ctx, projectId);
    jobId = result.jobId;
  } catch (err) {
    if (reserveAmount > 0) {
      await applyOwnLedgerEntry(ctx, {
        amount: reserveAmount,
        entryType: "refund",
        reason: "Refund: generation did not start",
        referenceType: "project",
        referenceId: projectId,
        idempotencyKey: `generation_reserve_refund:${reservationToken}`,
      });
    }
    throw err;
  }

  if (reserveAmount > 0) {
    const { data: job } = await ctx.supabase.from("generation_jobs").select("completed_count").eq("id", jobId).single();
    const completedCount = job?.completed_count ?? 0;
    const actualCost = completedCount * costPerImage;
    const unused = reserveAmount - actualCost;
    if (unused > 0) {
      await applyOwnLedgerEntry(ctx, {
        amount: unused,
        entryType: "refund",
        reason: `Refund for ${requestedCount - completedCount} design(s) that did not complete`,
        referenceType: "generation_job",
        referenceId: jobId,
        idempotencyKey: `generation_refund:${jobId}`,
      });
    }
  }

  return { jobId };
}
