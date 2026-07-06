import { clamp } from "@/lib/utils";
import { getPlugin } from "./registry";
import { segment } from "./segmenter";
import { countTokens } from "./tokenizer";
import type { ContentType, ManualStage, PluginCategory } from "./types";

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

/** Segment types a plugin category's transforms are allowed to modify. */
const STRUCTURED_TYPES: ReadonlySet<ContentType> = new Set([
  "json",
  "code",
  "sql",
  "stacktrace",
  "logs",
]);

function touchableFraction(category: PluginCategory, text: string): number {
  let touchable = 0;
  let total = 0;
  for (const s of segment(text)) {
    const tokens = countTokens(s.text);
    total += tokens;
    const structured = STRUCTURED_TYPES.has(s.type);
    // Structural/code optimizers work on structured content; the prose-facing
    // categories (semantic, summarization, retrieval, general) only ever see
    // prose-ish segments — the segment guards pass the rest through untouched.
    if (category === "structural" || category === "code") {
      if (structured) touchable += tokens;
    } else if (!structured) {
      touchable += tokens;
    }
  }
  return total > 0 ? touchable / total : 1;
}

/**
 * Chain the per-stage ratios to project how a manual pipeline shrinks a given
 * starting token count. Stages are applied in array order.
 *
 * When `text` is provided, each stage's expected reduction is scaled by the
 * fraction of the document its transforms are actually allowed to touch —
 * without this, a prose summarizer "projects" full compression on a document
 * that is 90% JSON it will pass through untouched.
 */
export function projectManualPipeline(
  stages: ManualStage[],
  startTokens: number,
  text?: string,
): PipelineProjection {
  let tokens = startTokens;
  const perStage: PipelineProjection["perStage"] = [];
  for (const stage of stages) {
    let ratio = stageRatio(stage.pluginId, stage.aggressiveness);
    if (text !== undefined) {
      const plugin = getPlugin(stage.pluginId);
      if (plugin) {
        const fraction = touchableFraction(plugin.metadata.category, text);
        ratio = 1 - (1 - ratio) * fraction;
      }
    }
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
