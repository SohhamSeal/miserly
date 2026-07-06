import type { ModelPricing } from "./types";
import { adjustTokensForFamily } from "./tokenizer";

/**
 * Model pricing table.
 *
 * Prices are USD per 1,000,000 tokens and are ESTIMATES for illustration —
 * they are easy to edit here and the UI recalculates instantly when the
 * selected model changes (no re-optimization needed).
 */
export const MODELS: ModelPricing[] = [
  {
    id: "gpt-5",
    label: "GPT-5",
    provider: "OpenAI",
    inputPerM: 1.25,
    outputPerM: 10,
    // OpenAI cached input ≈ 10% of base input.
    cacheReadPerM: 0.125,
    contextWindow: 400_000,
    tokenizer: "openai",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    provider: "OpenAI",
    inputPerM: 0.25,
    outputPerM: 2,
    cacheReadPerM: 0.025,
    contextWindow: 400_000,
    tokenizer: "openai",
  },
  {
    id: "claude-opus-4",
    label: "Claude Opus 4",
    provider: "Anthropic",
    inputPerM: 15,
    outputPerM: 75,
    // Anthropic cache reads ≈ 10% of base input; cache WRITES ≈ 1.25× input.
    cacheReadPerM: 1.5,
    cacheWritePerM: 18.75,
    contextWindow: 200_000,
    tokenizer: "anthropic",
  },
  {
    id: "claude-sonnet-4",
    label: "Claude Sonnet 4",
    provider: "Anthropic",
    inputPerM: 3,
    outputPerM: 15,
    cacheReadPerM: 0.3,
    cacheWritePerM: 3.75,
    contextWindow: 200_000,
    tokenizer: "anthropic",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "Google",
    inputPerM: 1.25,
    outputPerM: 10,
    // Gemini cached content ≈ 25% of base input.
    cacheReadPerM: 0.31,
    contextWindow: 1_000_000,
    tokenizer: "gemini",
    // Prompts over 200K tokens bill the whole request at the higher rate.
    longContext: { thresholdTokens: 200_000, inputPerM: 2.5, outputPerM: 15 },
  },
  {
    id: "gemini-flash",
    label: "Gemini 2.5 Flash",
    provider: "Google",
    inputPerM: 0.3,
    outputPerM: 2.5,
    cacheReadPerM: 0.075,
    contextWindow: 1_000_000,
    tokenizer: "gemini",
  },
  {
    id: "qwen-max",
    label: "Qwen Max",
    provider: "Alibaba",
    inputPerM: 1.6,
    outputPerM: 6.4,
    // qwen-max's window is ~32K — the 131K figure belongs to qwen-plus.
    contextWindow: 32_768,
    tokenizer: "qwen",
  },
  {
    id: "llama-3.1-405b",
    label: "Llama 3.1 405B",
    provider: "Meta",
    inputPerM: 0.9,
    outputPerM: 0.9,
    contextWindow: 128_000,
    tokenizer: "llama",
  },
  {
    id: "mistral-large",
    label: "Mistral Large",
    provider: "Mistral",
    inputPerM: 2,
    outputPerM: 6,
    contextWindow: 128_000,
    tokenizer: "mistral",
  },
  {
    id: "deepseek-v3",
    label: "DeepSeek V3",
    provider: "DeepSeek",
    inputPerM: 0.27,
    outputPerM: 1.1,
    // DeepSeek context caching ≈ 10% of base input on a cache hit.
    cacheReadPerM: 0.027,
    contextWindow: 128_000,
    tokenizer: "deepseek",
  },
];

export const DEFAULT_MODEL_ID = "gpt-5";

export function getModel(id: string): ModelPricing {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

/** Input USD-per-1M rate for a request of `tokens`, honoring long-context tiers. */
export function inputRateFor(tokens: number, model: ModelPricing): number {
  if (model.longContext && tokens > model.longContext.thresholdTokens) {
    return model.longContext.inputPerM;
  }
  return model.inputPerM;
}

/** Cost (USD) of sending `baseTokens` (OpenAI base count) as input to a model. */
export function contextCost(baseTokens: number, model: ModelPricing): number {
  const tokens = adjustTokensForFamily(baseTokens, model.tokenizer);
  return (tokens / 1_000_000) * inputRateFor(tokens, model);
}

export interface CostComparison {
  modelId: string;
  beforeTokens: number;
  afterTokens: number;
  beforeCost: number;
  afterCost: number;
  saved: number;
  savedPct: number;
}

export function compareCost(
  originalBaseTokens: number,
  optimizedBaseTokens: number,
  model: ModelPricing,
): CostComparison {
  const beforeCost = contextCost(originalBaseTokens, model);
  const afterCost = contextCost(optimizedBaseTokens, model);
  // Signed: negative means the "optimized" context is actually MORE expensive
  // (e.g. annotations grew it). The UI surfaces this instead of hiding it.
  const saved = beforeCost - afterCost;
  return {
    modelId: model.id,
    beforeTokens: adjustTokensForFamily(originalBaseTokens, model.tokenizer),
    afterTokens: adjustTokensForFamily(optimizedBaseTokens, model.tokenizer),
    beforeCost,
    afterCost,
    saved,
    savedPct: beforeCost > 0 ? saved / beforeCost : 0,
  };
}

/** Cost (USD) of a single CACHE READ of `baseTokens` (0 if unsupported). */
export function cacheReadCost(baseTokens: number, model: ModelPricing): number {
  if (model.cacheReadPerM === undefined) return 0;
  const tokens = adjustTokensForFamily(baseTokens, model.tokenizer);
  return (tokens / 1_000_000) * model.cacheReadPerM;
}

/**
 * Cost (USD) of the first, cache-CREATING call for `baseTokens`. Providers
 * without a write premium just pay the normal input price.
 */
export function cacheWriteCost(baseTokens: number, model: ModelPricing): number {
  if (model.cacheWritePerM === undefined) return contextCost(baseTokens, model);
  const tokens = adjustTokensForFamily(baseTokens, model.tokenizer);
  return (tokens / 1_000_000) * model.cacheWritePerM;
}

export interface CacheAnalysis {
  supported: boolean;
  cacheReadPerM: number;
  /** Fraction of base input price a cache read costs (e.g. 0.1 = 10%). */
  cacheFraction: number;
  /** Per-call input cost sending the full, uncached ORIGINAL prompt. */
  perCallOriginal: number;
  /** Per-call input cost sending the full, uncached OPTIMIZED prompt. */
  perCallCompressed: number;
  /** Cost of one cache-read reuse of the ORIGINAL prompt. */
  cacheReadOriginal: number;
  /** Cost of one cache-read reuse of the OPTIMIZED prompt. */
  cacheReadCompressed: number;
  /** First-call cost that CREATES the cache entry (includes any write premium). */
  cacheWriteOriginal: number;
  cacheWriteCompressed: number;
  /**
   * Number of reuses beyond which just caching the ORIGINAL (never compressing)
   * already beats compressing on every call — `null` when compressing every
   * call always wins on this input.
   */
  breakEvenReuse: number | null;
}

/**
 * Cache-aware economics for a REUSED prompt.
 *
 * The key, non-obvious truth this surfaces: compression and caching are not
 * rivals — the cheapest path for a stable, reused prompt is to compress it ONCE
 * and then let the provider cache the (now stable) compressed bytes, so every
 * reuse costs a cheap cache read. The trap is re-compressing per request: that
 * changes the bytes, busts the cache, and pays full input price every time.
 *
 * Example (GPT-5, cache read = 10% of input): a 20k-token prompt compressed to
 * 8k. Per call uncached: original ≈ $0.025, compressed ≈ $0.010. But cached, a
 * reuse of the compressed prompt is ≈ $0.001. So over 100 calls, "compress once
 * + cache" ≈ $0.109 vs "compress every call" ≈ $1.00 vs "cache the original,
 * never compress" ≈ $0.025 + 99×$0.0025 ≈ $0.272.
 */
export function analyzeCache(
  originalBaseTokens: number,
  optimizedBaseTokens: number,
  model: ModelPricing,
): CacheAnalysis {
  const perCallOriginal = contextCost(originalBaseTokens, model);
  const perCallCompressed = contextCost(optimizedBaseTokens, model);
  const cacheReadOriginal = cacheReadCost(originalBaseTokens, model);
  const cacheReadCompressed = cacheReadCost(optimizedBaseTokens, model);
  const cacheWriteOriginal = cacheWriteCost(originalBaseTokens, model);
  const cacheWriteCompressed = cacheWriteCost(optimizedBaseTokens, model);

  // n·compressed  vs  writeOriginal + (n−1)·cacheReadOriginal  →  solve for n.
  // The first cached call pays the provider's write premium (e.g. Anthropic
  // ≈1.25× input), so break-even lands slightly later than a read-only model
  // would suggest.
  let breakEvenReuse: number | null = null;
  if (perCallCompressed > cacheReadOriginal) {
    const n = (cacheWriteOriginal - cacheReadOriginal) / (perCallCompressed - cacheReadOriginal);
    breakEvenReuse = Math.max(2, Math.ceil(n));
  }

  return {
    supported: model.cacheReadPerM !== undefined,
    cacheReadPerM: model.cacheReadPerM ?? 0,
    cacheFraction: model.inputPerM > 0 ? (model.cacheReadPerM ?? 0) / model.inputPerM : 0,
    perCallOriginal,
    perCallCompressed,
    cacheReadOriginal,
    cacheReadCompressed,
    cacheWriteOriginal,
    cacheWriteCompressed,
    breakEvenReuse,
  };
}

/** Format a USD amount with sensible precision for small values. */
export function formatUSD(value: number): string {
  if (value === 0) return "$0.00";
  // Format the magnitude, then prepend the sign. Without splitting the sign out,
  // any negative value (e.g. a pipeline that INCREASED cost) hits the `< 0.01`
  // branch and renders as "$-5.2500" — four decimals with a misplaced minus.
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  if (v < 0.01) return `${sign}$${v.toFixed(4)}`;
  if (v < 1) return `${sign}$${v.toFixed(3)}`;
  return `${sign}$${v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
