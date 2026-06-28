import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CATEGORY_LABELS,
  PLUGINS,
  classify,
  defaultAggressiveness,
  getPlugin,
  planPipeline,
  type ContentType,
  type ManualStage,
  type OptimizationGoal,
} from "@/engine";

export type PipelineMode = "auto" | "manual";

/** One row in the Pipeline Builder. Array order is the execution order. */
export interface PipelineStageConfig {
  pluginId: string;
  enabled: boolean;
  /** 0..1 */
  aggressiveness: number;
}

// Category display order doubles as the canonical sort order (structural →
// code → semantic → retrieval → summarization → general).
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
function categoryRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function byCategoryThenName(
  a: (typeof PLUGINS)[number],
  b: (typeof PLUGINS)[number],
): number {
  return (
    categoryRank(a.metadata.category) - categoryRank(b.metadata.category) ||
    a.metadata.name.localeCompare(b.metadata.name)
  );
}

/** Seed from the auto-planner: planned stages enabled (in plan order), rest off. */
function planSeed(
  input: string,
  goal: OptimizationGoal,
  targetBudget: number,
  contentType: ContentType | "auto",
): PipelineStageConfig[] {
  const def = defaultAggressiveness(goal);
  const classification = classify(
    input,
    contentType === "auto" ? undefined : contentType,
  );
  const plan = planPipeline({ classification, goal, targetBudget });
  const planIds = plan.stages.map((s) => s.pluginId);
  const planSet = new Set(planIds);

  const planned: PipelineStageConfig[] = planIds.map((id) => ({
    pluginId: id,
    enabled: true,
    aggressiveness: def,
  }));
  const rest: PipelineStageConfig[] = [...PLUGINS]
    .filter((p) => !planSet.has(p.metadata.id))
    .sort(byCategoryThenName)
    .map((p) => ({ pluginId: p.metadata.id, enabled: false, aggressiveness: def }));

  return [...planned, ...rest];
}

/** Seed when there's no input yet: every type-compatible optimizer enabled. */
function compatibleSeed(
  goal: OptimizationGoal,
  contentType: ContentType | "auto",
): PipelineStageConfig[] {
  const def = defaultAggressiveness(goal);
  const type: ContentType = contentType === "auto" ? "mixed" : contentType;
  return [...PLUGINS].sort(byCategoryThenName).map((p) => ({
    pluginId: p.metadata.id,
    enabled: p.supports(type),
    aggressiveness: def,
  }));
}

export function computeSeedStages(
  input: string,
  goal: OptimizationGoal,
  targetBudget: number,
  contentType: ContentType | "auto",
): PipelineStageConfig[] {
  if (input.trim() !== "") {
    try {
      return planSeed(input, goal, targetBudget, contentType);
    } catch {
      // fall through to the compatible default
    }
  }
  return compatibleSeed(goal, contentType);
}

interface PipelineState {
  mode: PipelineMode;
  contentType: ContentType | "auto";
  stages: PipelineStageConfig[];

  setMode: (mode: PipelineMode) => void;
  setContentType: (type: ContentType | "auto") => void;
  /** Replace the whole ordered list at once (used when restoring history). */
  setStages: (stages: PipelineStageConfig[]) => void;
  toggleStage: (pluginId: string) => void;
  setAggressiveness: (pluginId: string, value: number) => void;
  moveStage: (pluginId: string, direction: "up" | "down") => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  /** Re-seed the editor from the current auto plan (overwrites edits). */
  resetToAuto: (
    input: string,
    goal: OptimizationGoal,
    targetBudget: number,
  ) => void;
  /** Seed if empty; otherwise reconcile with the current plugin registry. */
  ensureSeeded: (
    input: string,
    goal: OptimizationGoal,
    targetBudget: number,
  ) => void;
  /** Build the engine-facing manual plan from the enabled rows, in order. */
  toManualPlan: () => ManualStage[];
}

export const usePipelineStore = create<PipelineState>()(
  persist(
    (set, get) => ({
      mode: "auto",
      contentType: "auto",
      stages: [],

      setMode: (mode) => set({ mode }),
      setContentType: (contentType) => set({ contentType }),
      setStages: (stages) => set({ stages }),

      toggleStage: (pluginId) =>
        set((state) => ({
          stages: state.stages.map((s) =>
            s.pluginId === pluginId ? { ...s, enabled: !s.enabled } : s,
          ),
        })),

      setAggressiveness: (pluginId, value) =>
        set((state) => ({
          stages: state.stages.map((s) =>
            s.pluginId === pluginId
              ? { ...s, aggressiveness: Math.min(1, Math.max(0, value)) }
              : s,
          ),
        })),

      moveStage: (pluginId, direction) =>
        set((state) => {
          const index = state.stages.findIndex((s) => s.pluginId === pluginId);
          if (index === -1) return state;
          const target = direction === "up" ? index - 1 : index + 1;
          if (target < 0 || target >= state.stages.length) return state;
          const next = [...state.stages];
          [next[index], next[target]] = [next[target], next[index]];
          return { stages: next };
        }),

      reorder: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.stages.length ||
            toIndex >= state.stages.length
          ) {
            return state;
          }
          const next = [...state.stages];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { stages: next };
        }),

      resetToAuto: (input, goal, targetBudget) =>
        set({ stages: computeSeedStages(input, goal, targetBudget, get().contentType) }),

      ensureSeeded: (input, goal, targetBudget) => {
        const { stages, contentType } = get();
        if (stages.length === 0) {
          set({ stages: computeSeedStages(input, goal, targetBudget, contentType) });
          return;
        }
        // Reconcile a persisted list with the live plugin registry: drop
        // optimizers that no longer exist and append any newly-added ones.
        const known = new Set(PLUGINS.map((p) => p.metadata.id));
        const def = defaultAggressiveness(goal);
        const filtered = stages.filter((s) => known.has(s.pluginId));
        const present = new Set(filtered.map((s) => s.pluginId));
        const added: PipelineStageConfig[] = [...PLUGINS]
          .filter((p) => !present.has(p.metadata.id))
          .sort(byCategoryThenName)
          .map((p) => ({
            pluginId: p.metadata.id,
            enabled: false,
            aggressiveness: def,
          }));
        if (filtered.length !== stages.length || added.length > 0) {
          set({ stages: [...filtered, ...added] });
        }
      },

      toManualPlan: () =>
        get()
          .stages.filter((s) => s.enabled && getPlugin(s.pluginId))
          .map((s) => ({ pluginId: s.pluginId, aggressiveness: s.aggressiveness })),
    }),
    {
      name: "miserly-pipeline",
      version: 1,
      partialize: (state) => ({
        mode: state.mode,
        contentType: state.contentType,
        stages: state.stages,
      }),
    },
  ),
);
