import { assertNever, clamp } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import { GOAL_LABELS, TYPE_LABELS } from "./labels";
import { PLUGINS } from "./registry";
import type {
  ClassificationResult,
  ContentType,
  OptimizationGoal,
  OptimizerPlugin,
  PlanResult,
  PluginCategory,
} from "./types";

const CATEGORY_ORDER: PluginCategory[] = [
  "structural",
  "code",
  "semantic",
  "retrieval",
  "summarization",
  "general",
];

interface GoalWeights {
  reduction: number;
  quality: number;
  speed: number;
}

function goalWeights(goal: OptimizationGoal): GoalWeights {
  switch (goal) {
    case "max_compression":
      return { reduction: 0.7, quality: 0.1, speed: 0.2 };
    case "highest_quality":
      return { reduction: 0.2, quality: 0.7, speed: 0.1 };
    case "lowest_cost":
      return { reduction: 0.6, quality: 0.2, speed: 0.2 };
    case "fastest":
      return { reduction: 0.3, quality: 0.2, speed: 0.5 };
    case "balanced":
      return { reduction: 0.45, quality: 0.35, speed: 0.2 };
    default:
      return assertNever(goal);
  }
}

function speedBias(category: PluginCategory): number {
  return category === "summarization" || category === "retrieval" ? 0.5 : 0.85;
}

function reasonFor(p: OptimizerPlugin, primary: ContentType): string {
  const type = (TYPE_LABELS[primary] ?? primary).toLowerCase();
  const byCategory: Record<PluginCategory, string> = {
    structural: `removes structural redundancy in ${type}`,
    code: "trims code ceremony while keeping behavior",
    semantic: "drops low-information tokens while preserving meaning",
    retrieval: "keeps only the load-bearing facts",
    summarization: "condenses long passages into summaries",
    general: "applies general-purpose reduction",
  };
  return `${p.metadata.name} ${byCategory[p.metadata.category]}.`;
}

export interface PlanInput {
  classification: ClassificationResult;
  goal: OptimizationGoal;
  targetBudget: number;
  enabledPluginIds?: string[];
  /**
   * Pack as many compatible stages as the goal allows instead of stopping when
   * the (rough, metadata-based) projection first fits the budget. The runner
   * uses this as a fallback when the MEASURED output of the normal plan cannot
   * reach the budget even at maximum aggressiveness.
   */
  exhaustive?: boolean;
}

export function planPipeline(input: PlanInput): PlanResult {
  const { classification, goal, targetBudget } = input;
  const { primary, secondary } = classification;

  const universe = input.enabledPluginIds
    ? PLUGINS.filter((p) => input.enabledPluginIds!.includes(p.metadata.id))
    : PLUGINS;

  const candidates = universe.filter(
    (p) => p.supports(primary) || (secondary !== null && p.supports(secondary)),
  );

  const weights = goalWeights(goal);
  const scored = candidates
    .map((p) => {
      const ratio = p.expectedRatio(goal);
      const reduction = 1 - ratio;
      const quality = clamp(1 - reduction * 0.5, 0, 1);
      const speed = speedBias(p.metadata.category);
      const compat = p.supports(primary) ? 1 : 0.5;
      // Prefer an optimizer that truly delegates to a real external package over
      // a local simulation. Nothing ships as "external" yet, so this is 0 for
      // every plugin today — but it keeps the tiebreak honest (and ready) for the
      // moment a real adapter lands, instead of rewarding faux-"real" plugins.
      const externalBonus = p.metadata.provenance === "external" ? 0.05 : 0;
      const score =
        weights.reduction * reduction +
        weights.quality * quality +
        weights.speed * speed +
        compat * 0.15 +
        externalBonus;
      return { p, score, ratio };
    })
    .sort((a, b) => b.score - a.score);

  const startTokens = classification.stats.tokens;
  let projected = startTokens;
  const maxStages = goal === "max_compression" ? 5 : goal === "fastest" ? 2 : 4;

  const chosen: Array<{ p: OptimizerPlugin; reason: string }> = [];
  const pool = [...scored];
  const stageCap = input.exhaustive ? 5 : maxStages;
  let earlyStopped = false;
  while (chosen.length < stageCap && pool.length > 0) {
    if (
      !input.exhaustive &&
      projected <= targetBudget &&
      goal !== "max_compression" &&
      chosen.length >= 1
    ) {
      earlyStopped = true;
      break;
    }
    const next = pool.shift()!;
    const sameCategory = chosen.filter(
      (c) => c.p.metadata.category === next.p.metadata.category,
    ).length;
    if (sameCategory >= 2) continue;
    chosen.push({ p: next.p, reason: reasonFor(next.p, primary) });
    projected = Math.round(projected * next.ratio);
  }
  if (chosen.length === 0 && scored.length > 0) {
    chosen.push({ p: scored[0].p, reason: reasonFor(scored[0].p, primary) });
    projected = Math.round(startTokens * scored[0].ratio);
  }

  chosen.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.p.metadata.category) -
      CATEGORY_ORDER.indexOf(b.p.metadata.category),
  );

  const reductionPct = startTokens > 0 ? 1 - projected / startTokens : 0;
  const reasoning: string[] = [
    `Goal: ${GOAL_LABELS[goal]} — target ≈ ${formatCompact(targetBudget)} tokens.`,
    secondary
      ? `Detected ${TYPE_LABELS[primary]} with ${TYPE_LABELS[secondary]} as the dominant content.`
      : `Detected ${TYPE_LABELS[primary]} as the dominant content.`,
    ...chosen.map((c, i) => `${i + 1}. ${c.reason}`),
    `Rough projection ≈ ${formatCompact(projected)} tokens (${Math.round(
      reductionPct * 100,
    )}% smaller) — estimated from each optimizer's typical ratio; the real figure is measured after the run.`,
  ];
  if (earlyStopped) {
    // Say the quiet part out loud — a light plan on a small input confuses
    // people who expected maximum squeeze.
    reasoning.push(
      `Stopped adding stages early: the projection already fits your ${formatCompact(
        targetBudget,
      )}-token budget, so quality is preserved. Pick “${GOAL_LABELS.max_compression}” or a lower budget to squeeze harder.`,
    );
  }

  return {
    goal,
    targetBudget,
    stages: chosen.map((c) => ({ pluginId: c.p.metadata.id, reason: c.reason })),
    reasoning,
    mode: "sequential",
  };
}
