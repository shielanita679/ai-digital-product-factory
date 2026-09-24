import { CREDIT_COSTS } from "@/config/credits";

/**
 * Wizard-side preview only — nothing is charged or stored against it. The
 * authoritative charge happens server-side in
 * src/lib/generation/generation-billing.ts, which reads the SAME
 * CREDIT_COSTS.imageGeneration constant so this preview can never drift
 * from what actually gets billed.
 */
export function estimateGenerationCredits(input: { designCount: number }): number {
  return input.designCount * CREDIT_COSTS.imageGeneration;
}
