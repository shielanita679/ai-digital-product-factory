const LEADING_FILLER =
  /^(please\s+)?(?:(?:create|make|design|build|generate|i want|i'd like|i need)\s+)?(?:(?:a|an|some)\s+)?(?:(?:bundle|collection|set|pack|series|group)\s+of\s+)?/i;

const MAX_NAME_LENGTH = 60;

/**
 * Deterministic, non-AI heuristic for turning a free-form idea prompt into
 * a short product name — strips common leading filler ("create a...",
 * "I want..."), trims to a word boundary, and title-cases it.
 */
export function deriveProjectName(prompt: string): string {
  let name = prompt.trim().replace(LEADING_FILLER, "");

  if (name.length > MAX_NAME_LENGTH) {
    const truncated = name.slice(0, MAX_NAME_LENGTH);
    const lastSpace = truncated.lastIndexOf(" ");
    name = (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated).trim();
  }

  name = name.replace(/[.,;:!?\s]+$/, "").trim();

  if (name.length === 0) {
    return "Untitled Product";
  }

  return name.charAt(0).toUpperCase() + name.slice(1);
}
