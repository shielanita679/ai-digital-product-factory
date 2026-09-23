/**
 * Abstraction for AI-powered text tasks (idea/prompt enhancement, generated
 * listing copy, etc.). `context` is a free-form bag rather than a typed
 * per-task shape — real providers just serialize it into a prompt — but by
 * convention Phase 9's listing generation puts `context.task` (see
 * `ListingTextTask` in providers/mock-text-provider.ts) so a provider can
 * special-case listing text without the interface itself knowing anything
 * about listings. `prompt-engine.ts` is fully deterministic and never calls
 * this; this abstraction exists so a real provider can be added later
 * without changing any calling code.
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
