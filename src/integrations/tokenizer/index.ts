import { runtime } from "@/config/runtime";
import { countAccurate } from "../generated";
import { countHeuristic } from "./heuristic";

/** True when gpt-tokenizer is installed, i.e. the exact count is available. */
export const accurateTokenizerAvailable: boolean = countAccurate != null;

/**
 * Base token count for `text`.
 *
 * Uses the exact tokenizer when it is both installed AND enabled by the user;
 * otherwise falls back to the fast ~4-chars/token heuristic. This keeps the
 * engine synchronous (no async loading on the hot path).
 */
export function countBaseTokens(text: string): number {
  if (countAccurate != null && runtime.useAccurateTokenizer) {
    return countAccurate(text);
  }
  return countHeuristic(text);
}

/** Which counter `countBaseTokens` is using right now. */
export function activeTokenizerKind(): "exact" | "estimated" {
  return countAccurate != null && runtime.useAccurateTokenizer ? "exact" : "estimated";
}
