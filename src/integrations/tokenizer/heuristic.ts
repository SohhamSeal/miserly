/**
 * Fallback token estimate, used when the accurate tokenizer (gpt-tokenizer) is
 * not installed. English text averages roughly 4 characters per token, so this
 * gives a close-enough live count for the UI without shipping a 55 MB package.
 */
export function countHeuristic(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}
