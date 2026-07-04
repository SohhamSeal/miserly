import { tokenDistributionByType } from "./classifier";
import { TYPE_ACCENT, TYPE_LABELS } from "./labels";
import { countTokens } from "./tokenizer";
import type { BudgetSegment, ContentType } from "./types";

/** How the input tokens are really distributed across content types. */
export function buildBudgetBefore(text: string): BudgetSegment[] {
  const dist = tokenDistributionByType(text);
  const total = countTokens(text) || 1;
  const distTotal = [...dist.values()].reduce((a, b) => a + b, 0) || 1;

  const segments = [...dist.entries()]
    .map(([type, tokens]) => ({
      label: TYPE_LABELS[type],
      tokens: Math.round((tokens / distTotal) * total),
      accent: TYPE_ACCENT[type],
    }))
    .filter((s) => s.tokens > 0);

  const threshold = total * 0.03;
  const big = segments.filter((s) => s.tokens >= threshold);
  const small = segments.filter((s) => s.tokens < threshold);
  const miscTokens = small.reduce((a, s) => a + s.tokens, 0);
  if (miscTokens > 0) {
    big.push({ label: "Miscellaneous", tokens: miscTokens, accent: "slate" });
  }
  return big.sort((a, b) => b.tokens - a.tokens);
}

const AFTER_GROUPS: Array<{ label: string; accent: string; from: ContentType[] }> = [
  { label: "Important logs", accent: "amber", from: ["logs", "stacktrace"] },
  { label: "Critical code", accent: "emerald", from: ["code", "sql"] },
  { label: "Important metadata", accent: "sky", from: ["json"] },
  { label: "Knowledge", accent: "indigo", from: ["rag", "knowledge"] },
  { label: "Summaries", accent: "violet", from: ["prose", "markdown", "chat", "mixed"] },
];

/** What kinds of information actually survive into the optimized output. */
export function buildBudgetAfter(text: string): BudgetSegment[] {
  const dist = tokenDistributionByType(text);
  const total = countTokens(text) || 1;
  const distTotal = [...dist.values()].reduce((a, b) => a + b, 0) || 1;

  const raw = AFTER_GROUPS.map((g) => ({
    label: g.label,
    accent: g.accent,
    tokens: g.from.reduce((acc, t) => acc + (dist.get(t) ?? 0), 0),
  })).filter((g) => g.tokens > 0);

  return raw
    .map((g) => ({
      label: g.label,
      accent: g.accent,
      tokens: Math.round((g.tokens / distTotal) * total),
    }))
    .filter((s) => s.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}
