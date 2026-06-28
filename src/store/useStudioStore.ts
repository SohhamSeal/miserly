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

  clearInput: () =>
    set({
      input: "",
      status: "idle",
      result: null,
      error: null,
      liveStages: [],
      logs: [],
      phases: freshPhases(),
    }),

  reset: () =>
    set({
      status: "idle",
      result: null,
      error: null,
      liveStages: [],
      logs: [],
      phases: freshPhases(),
    }),

  optimize: async () => {
    const { input, goal, targetBudget, modelId, status } = get();
    if (status === "running" || input.trim() === "") return;

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
          // When auto-detect is off, skip classification and use a neutral plan.
          contentTypeOverride: runtime.autoDetect ? undefined : "mixed",
        },
        {
          onPhases: (phases) => set({ phases }),
          onStage: (stage) =>
            set((state) => ({ liveStages: [...state.liveStages, stage] })),
          onLog: (event) => set((state) => ({ logs: [...state.logs, event] })),
        },
      );
      set({ status: "done", result });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
