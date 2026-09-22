/**
 * Abstraction for future AI-powered text tasks (idea/prompt enhancement,
 * generated listing copy, etc.). Nothing in Phase 5 requires a real LLM —
 * `prompt-engine.ts` is fully deterministic and never calls this — but the
 * interface exists now so Phase 6+ can add a real provider without
 * changing any calling code.
 */
export type TextGenerationInput = {
  instruction: string;
  context?: Record<string, unknown>;
};

export type TextGenerationResult =
  | { ok: true; text: string }
  | { ok: false; errorMessage: string };

export interface TextProvider {
  readonly name: string;
  generateText(input: TextGenerationInput): Promise<TextGenerationResult>;
}
