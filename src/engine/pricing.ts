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
    contextWindow: 400_000,
    tokenizer: "openai",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    provider: "OpenAI",
    inputPerM: 0.25,
    outputPerM: 2,
    contextWindow: 400_000,
    tokenizer: "openai",
  },
  {
    id: "claude-opus-4",
    label: "Claude Opus 4",
    provider: "Anthropic",
    inputPerM: 15,
    outputPerM: 75,
    contextWindow: 200_000,
    tokenizer: "anthropic",
  },
  {
    id: "claude-sonnet-4",
    label: "Claude Sonnet 4",
    provider: "Anthropic",
    inputPerM: 3,
    outputPerM: 15,
    contextWindow: 200_000,
    tokenizer: "anthropic",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "Google",
    inputPerM: 1.25,
    outputPerM: 10,
    contextWindow: 1_000_000,
    tokenizer: "gemini",
  },
  {
    id: "gemini-flash",
    label: "Gemini 2.5 Flash",
    provider: "Google",
    inputPerM: 0.3,
    outputPerM: 2.5,
    contextWindow: 1_000_000,
    tokenizer: "gemini",
  },
  {
    id: "qwen-max",
    label: "Qwen Max",
    provider: "Alibaba",
    inputPerM: 0.4,
    outputPerM: 1.2,
    contextWindow: 131_072,
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
    contextWindow: 128_000,
    tokenizer: "deepseek",
  },
];

export const DEFAULT_MODEL_ID = "gpt-5";

export function getModel(id: string): ModelPricing {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

/** Cost (USD) of sending `baseTokens` (OpenAI base count) as input to a model. */
export function contextCost(baseTokens: number, model: ModelPricing): number {
  const tokens = adjustTokensForFamily(baseTokens, model.tokenizer);
  return (tokens / 1_000_000) * model.inputPerM;
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
  const saved = Math.max(0, beforeCost - afterCost);
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

/** Format a USD amount with sensible precision for small values. */
export function formatUSD(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
