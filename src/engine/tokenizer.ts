import { countBaseTokens } from "@/integrations";
import type { ModelPricing, TokenizerFamily } from "./types";

/**
 * Token counting.
 *
 * The base count comes from the tokenizer integration: the exact OpenAI
 * tokenizer (gpt-tokenizer) when it is installed and enabled, otherwise a fast
 * ~4-characters-per-token heuristic. Other providers tokenize slightly
 * differently, so we apply a per-family scaling factor relative to the base
 * count. These factors are approximations — estimates, not exact tokenizers.
 */

const FAMILY_FACTOR: Record<TokenizerFamily, number> = {
  openai: 1.0,
  anthropic: 1.08,
  gemini: 0.98,
  llama: 1.1,
  mistral: 1.12,
  deepseek: 1.05,
  qwen: 1.06,
};

/** Base token count (OpenAI-equivalent). */
export function countTokens(text: string): number {
  return countBaseTokens(text);
}

/** Adjust a base (OpenAI) token count for a specific model family. */
export function adjustTokensForFamily(
  baseTokens: number,
  family: TokenizerFamily,
): number {
  return Math.round(baseTokens * FAMILY_FACTOR[family]);
}

/** Convenience: token count as a given model would see it. */
export function countTokensForModel(text: string, model: ModelPricing): number {
  return adjustTokensForFamily(countTokens(text), model.tokenizer);
}
