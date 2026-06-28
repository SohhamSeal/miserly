import { TYPE_ACCENT, TYPE_LABELS } from "./labels";
import type { BudgetSegment, ClassificationResult, ContentType } from "./types";

/** How the input tokens are distributed across detected content types. */
export function buildBudgetBefore(
  classification: ClassificationResult,
  originalTokens: number,
): BudgetSegment[] {
  const segments = classification.detected
    .map((d) => ({
      label: TYPE_LABELS[d.type],
      tokens: Math.round(originalTokens * d.share),
      accent: TYPE_ACCENT[d.type],
    }))
    .filter((s) => s.tokens > 0);

  const threshold = originalTokens * 0.03;
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

/** What kinds of information survive into the optimized output. */
export function buildBudgetAfter(
  classification: ClassificationResult,
  optimizedTokens: number,
): BudgetSegment[] {
  const shareByType = new Map<ContentType, number>();
  for (const d of classification.detected) shareByType.set(d.type, d.share);

  const raw = AFTER_GROUPS.map((g) => ({
    label: g.label,
    accent: g.accent,
    share: g.from.reduce((acc, t) => acc + (shareByType.get(t) ?? 0), 0),
  })).filter((g) => g.share > 0);

  const totalShare = raw.reduce((a, g) => a + g.share, 0) || 1;
  return raw
    .map((g) => ({
      label: g.label,
      accent: g.accent,
      tokens: Math.round(optimizedTokens * (g.share / totalShare)),
    }))
    .filter((s) => s.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}
