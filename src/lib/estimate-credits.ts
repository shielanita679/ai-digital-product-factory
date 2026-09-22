/**
 * Placeholder credit-estimation abstraction. Phase 11 replaces this with
 * real ledger-backed pricing; until then this is a preview only — nothing
 * is charged or stored against it.
 */
export function estimateGenerationCredits(input: { designCount: number }): number {
  return input.designCount;
}
