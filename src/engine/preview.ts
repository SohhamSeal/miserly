import { clamp } from "@/lib/utils";
import { getPlugin } from "./registry";
import type { ManualStage } from "./types";

/**
 * Live preview model for the Pipeline Builder.
 *
 * The real run compresses with transforms whose exact output depends on the
 * text, so these numbers are an *estimate* (clearly labelled as such in the
 * UI). We map aggressiveness onto the plugin's characteristic ratio range:
 *
 *   aggressiveness 0  -> max ratio  (gentlest, least compression)
 *   aggressiveness 1  -> min ratio  (hardest, most compression)
 *
 * Example: Ponytail's ratioRange is [0.5, 0.75].
 *   at 0.9 aggressiveness -> 0.75 - (0.75 - 0.5) * 0.9 = 0.525
 *   so 10,000 tokens -> ~5,250 tokens after that stage.
 */
export function estimateStageRatio(
  range: [number, number],
  aggressiveness: number,
): number {
  const [min, max] = range;
  const a = clamp(aggressiveness, 0, 1);
  return max - (max - min) * a;
}

/** Estimated output/input ratio for a specific plugin at an aggressiveness. */
export function stageRatio(pluginId: string, aggressiveness: number): number {
  const plugin = getPlugin(pluginId);
  if (!plugin) return 1;
  return estimateStageRatio(plugin.metadata.ratioRange, aggressiveness);
}

export interface PipelineProjection {
  startTokens: number;
  projectedTokens: number;
  /** 0..1 fraction smaller. */
  reductionPct: number;
  perStage: Array<{
    pluginId: string;
    ratio: number;
    tokensBefore: number;
    tokensAfter: number;
  }>;
}

/**
 * Chain the per-stage ratios to project how a manual pipeline shrinks a given
 * starting token count. Stages are applied in array order.
 */
export function projectManualPipeline(
  stages: ManualStage[],
  startTokens: number,
): PipelineProjection {
  let tokens = startTokens;
  const perStage: PipelineProjection["perStage"] = [];
  for (const stage of stages) {
    const ratio = stageRatio(stage.pluginId, stage.aggressiveness);
    const before = tokens;
    tokens = Math.round(tokens * ratio);
    perStage.push({
      pluginId: stage.pluginId,
      ratio,
      tokensBefore: before,
      tokensAfter: tokens,
    });
  }
  const reductionPct = startTokens > 0 ? 1 - tokens / startTokens : 0;
  return { startTokens, projectedTokens: tokens, reductionPct, perStage };
}
