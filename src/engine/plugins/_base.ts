import { assertNever, clamp } from "@/lib/utils";
import type { TransformResult } from "../transforms";
import type {
  CompressArgs,
  CompressOutput,
  OptimizationGoal,
  OptimizerPlugin,
  PluginMetadata,
} from "../types";

/**
 * Shared helpers for building optimizer plugins. This file has no default
 * export, so the registry's glob import skips it (only real plugins export a
 * default OptimizerPlugin).
 */

/** Map a goal to a target output/input ratio inside the plugin's range. */
export function goalRatio(
  range: [number, number],
  goal: OptimizationGoal,
): number {
  const [min, max] = range; // min = most aggressive (smallest output)
  switch (goal) {
    case "max_compression":
      return min;
    case "lowest_cost":
      return min + (max - min) * 0.15;
    case "fastest":
      return max - (max - min) * 0.2;
    case "highest_quality":
      return max;
    case "balanced":
      return (min + max) / 2;
    default:
      return assertNever(goal);
  }
}

/** Default per-stage aggressiveness for a goal (0..1). */
export function defaultAggressiveness(goal: OptimizationGoal): number {
  switch (goal) {
    case "max_compression":
      return 0.9;
    case "lowest_cost":
      return 0.75;
    case "balanced":
      return 0.55;
    case "fastest":
      return 0.5;
    case "highest_quality":
      return 0.3;
    default:
      return assertNever(goal);
  }
}

/** Run a sequence of transforms, collecting their notes. */
export function compose(
  text: string,
  steps: Array<(t: string) => TransformResult>,
): { text: string; notes: string[] } {
  let cur = text;
  const notes: string[] = [];
  for (const step of steps) {
    const r = step(cur);
    cur = r.text;
    if (r.note) notes.push(r.note);
  }
  return { text: cur, notes };
}

/** Self-estimate of preserved meaning, penalized as aggressiveness rises. */
export function qualityOf(base: number, aggressiveness: number): number {
  return clamp(base - Math.max(0, aggressiveness - 0.5) * 0.18, 0.5, 0.99);
}

export function definePlugin(
  metadata: PluginMetadata,
  run: (args: CompressArgs) => CompressOutput,
): OptimizerPlugin {
  return {
    metadata,
    supports: (type) =>
      metadata.supportedTypes.includes(type) || metadata.category === "general",
    expectedRatio: (goal) => goalRatio(metadata.ratioRange, goal),
    compress: run,
  };
}
