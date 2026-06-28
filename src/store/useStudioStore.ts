import { create } from "zustand";
import {
  DEFAULT_MODEL_ID,
  PHASE_INFO,
  runOptimization,
  type LogEvent,
  type OptimizationGoal,
  type OptimizationResult,
  type PipelinePhase,
  type StageResult,
} from "@/engine";
import { SAMPLES } from "@/data/samples";
import { runtime } from "@/config/runtime";
import { usePipelineStore } from "@/store/usePipelineStore";
import { useHistoryStore, type HistoryEntry } from "@/store/useHistoryStore";

/** Phase list with every step marked done — used when re-opening a past run. */
function completedPhases(): PipelinePhase[] {
  return PHASE_INFO.map((p) => ({ ...p, status: "completed" as const }));
}

export type RunStatus = "idle" | "running" | "done" | "error";

function freshPhases(): PipelinePhase[] {
  return PHASE_INFO.map((p) => ({ ...p, status: "waiting" as const }));
}

interface StudioState {
  input: string;
  modelId: string;
  goal: OptimizationGoal;
  targetBudget: number;

  status: RunStatus;
  phases: PipelinePhase[];
  liveStages: StageResult[];
  logs: LogEvent[];
  result: OptimizationResult | null;
  error: string | null;

  setInput: (value: string) => void;
  setModelId: (id: string) => void;
  setGoal: (goal: OptimizationGoal) => void;
  setTargetBudget: (tokens: number) => void;
  loadSample: (id: string) => void;
  clearInput: () => void;
  reset: () => void;
  optimize: () => Promise<void>;
  /** Re-open a past run: restores its input, settings, pipeline and report. */
  loadFromHistory: (entry: HistoryEntry) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  input: "",
  modelId: DEFAULT_MODEL_ID,
  goal: "balanced",
  targetBudget: 8000,

  status: "idle",
  phases: freshPhases(),
  liveStages: [],
  logs: [],
  result: null,
  error: null,

  setInput: (value) => set({ input: value }),
  setModelId: (id) => set({ modelId: id }),
  setGoal: (goal) => set({ goal }),
  setTargetBudget: (tokens) => set({ targetBudget: tokens }),

  loadSample: (id) => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    useHistoryStore.getState().setActive(null);
    set({
      input: sample.content,
      status: "idle",
      result: null,
      error: null,
      liveStages: [],
      logs: [],
      phases: freshPhases(),
    });
  },

  clearInput: () => {
    useHistoryStore.getState().setActive(null);
    set({
      input: "",
      status: "idle",
      result: null,
      error: null,
      liveStages: [],
      logs: [],
      phases: freshPhases(),
    });
  },

  reset: () => {
    useHistoryStore.getState().setActive(null);
    set({
      status: "idle",
      result: null,
      error: null,
      liveStages: [],
      logs: [],
      phases: freshPhases(),
    });
  },

  optimize: async () => {
    const { input, goal, targetBudget, modelId, status } = get();
    if (status === "running" || input.trim() === "") return;

    // Manual pipeline + content-type override come from the Pipeline Builder.
    const pipeline = usePipelineStore.getState();
    const manualPlan =
      pipeline.mode === "manual" ? pipeline.toManualPlan() : undefined;
    const contentTypeOverride =
      pipeline.contentType !== "auto"
        ? pipeline.contentType
        : // When auto-detect is off and no explicit type is chosen, use a neutral plan.
          runtime.autoDetect
          ? undefined
          : "mixed";

    set({
      status: "running",
      result: null,
      error: null,
      logs: [],
      liveStages: [],
      phases: freshPhases(),
    });

    try {
      const result = await runOptimization(
        {
          input,
          goal,
          targetBudget,
          modelId,
          contentTypeOverride,
          manualPlan,
        },
        {
          onPhases: (phases) => set({ phases }),
          onStage: (stage) =>
            set((state) => ({ liveStages: [...state.liveStages, stage] })),
          onLog: (event) => set((state) => ({ logs: [...state.logs, event] })),
        },
      );
      set({ status: "done", result });

      // Capture the run for the session history. We snapshot the pipeline
      // config + model here because the result itself doesn't carry them.
      const p = usePipelineStore.getState();
      useHistoryStore.getState().record({
        id: result.id,
        createdAt: result.createdAt,
        modelId,
        pipelineMode: p.mode,
        pipelineContentType: p.contentType,
        pipelineStages: p.stages,
        result,
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  loadFromHistory: (entry) => {
    const { result } = entry;
    // Restore the Pipeline Builder to exactly how this run was configured.
    const pipeline = usePipelineStore.getState();
    pipeline.setMode(entry.pipelineMode);
    pipeline.setContentType(entry.pipelineContentType);
    pipeline.setStages(entry.pipelineStages);

    set({
      input: result.inputText,
      goal: result.plan.goal,
      targetBudget: result.plan.targetBudget,
      modelId: entry.modelId,
      status: "done",
      result,
      error: null,
      liveStages: result.stages,
      logs: [],
      phases: completedPhases(),
    });

    useHistoryStore.getState().setActive(entry.id);
  },
}));
