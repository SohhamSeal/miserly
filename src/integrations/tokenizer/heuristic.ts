/**
 * Fallback token estimate, used when the accurate tokenizer (gpt-tokenizer) is
 * not installed. English text averages roughly 4 characters per token, so this
 * gives a close-enough live count for the UI without shipping a 55 MB package.
 */
export function countHeuristic(text: string): number {
  if (!text) return 0;
  // Collapse runs of spaces/tabs first: a real tokenizer treats indentation and
  // padding as roughly one token, not one per ~4 chars. Without this, whitespace-
  // stripping stages look like they save far more than they actually do.
  const compact = text.replace(/[ \t]+/g, " ");
  return Math.max(1, Math.round(compact.length / 4));
}
