import type { TextProvider, TextGenerationInput, TextGenerationResult } from "@/lib/ai/text-provider";

/**
 * Deterministic, offline stand-in for a future LLM-backed TextProvider.
 * Requires no API key and never touches the network. It does the simplest
 * useful thing (normalizes whitespace on the instruction) so callers can
 * exercise the TextProvider interface end-to-end before a real provider
 * exists.
 */
export class MockTextProvider implements TextProvider {
  readonly name = "mock";

  async generateText(input: TextGenerationInput): Promise<TextGenerationResult> {
    const text = input.instruction.trim().replace(/\s+/g, " ");
    if (!text) {
      return { ok: false, errorMessage: "Instruction was empty." };
    }
    return { ok: true, text };
  }
}
