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
import { featureEnabledFrom, useSettingsStore } from "@/store/useSettingsStore";

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
  /** User's manual edits to the optimized output (`null` => showing engine
   * output untouched). Lifted into the store so the report / cost / budget
   * cards can recompute from what's actually on screen. */
  editedOutput: string | null;
  error: string | null;
  /** Bumped whenever the run context changes; lets a superseded async run detect
   * that it must not write its (now stale) result back into the store. */
  runToken: number;

  setInput: (value: string) => void;
  setEditedOutput: (text: string | null) => void;
  /** Abandon an in-flight run, restoring the previous result if there was one. */
  cancel: () => void;
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
  editedOutput: null,
  error: null,
  runToken: 0,

  setEditedOutput: (text) => set({ editedOutput: text }),

  cancel: () =>
    set((s) => {
      if (s.status !== "running") return {};
      const runToken = s.runToken + 1;
      // If this run superseded a previous result, fall back to showing it;
      // otherwise there's nothing to show so return to the empty idle state.
      return s.result
        ? {
            runToken,
            status: "done" as const,
            phases: completedPhases(),
            liveStages: s.result.stages,
          }
        : {
            runToken,
            status: "idle" as const,
            phases: freshPhases(),
            liveStages: [],
            logs: [],
          };
    }),

  setInput: (value) =>
    set((s) =>
      s.status === "running"
        ? {
            // Editing the input invalidates an in-flight run: bump the token so
            // its (now stale) result is dropped when it finishes, and drop back
            // to idle so the UI doesn't hang on a spinner for a run that can no
            // longer match what's on screen.
            input: value,
            runToken: s.runToken + 1,
            status: "idle",
            phases: freshPhases(),
            liveStages: [],
            logs: [],
          }
        : { input: value },
    ),
  setModelId: (id) => set({ modelId: id }),
  setGoal: (goal) => set({ goal }),
  setTargetBudget: (tokens) => set({ targetBudget: tokens }),

  loadSample: (id) => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    useHistoryStore.getState().setActive(null);
    set((s) => ({
      runToken: s.runToken + 1,
      input: sample.content,
      status: "idle",
      result: null,
      editedOutput: null,
      error: null,
      liveStages: [],
      logs: [],
      phases: freshPhases(),
    }));
  },

  clearInput: () => {
    useHistoryStore.getState().setActive(null);
    set((s) => ({
      runToken: s.runToken + 1,
      input: "",
      status: "idle",
      result: null,
      editedOutput: null,
      error: null,
      liveStages: [],
      logs: [],
      phases: freshPhases(),
    }));
  },

  reset: () => {
    useHistoryStore.getState().setActive(null);
    set((s) => ({
      runToken: s.runToken + 1,
      status: "idle",
      result: null,
      editedOutput: null,
      error: null,
      liveStages: [],
      logs: [],
      phases: freshPhases(),
    }));
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

    // Tag this run. If the user clears the input, loads a sample, resets, or
    // re-opens a history entry mid-run, the token changes and every write below
    // is dropped — otherwise a slow run would "resurrect" its stale result.
    const token = get().runToken + 1;
    const alive = () => get().runToken === token;
    // Keep the PREVIOUS result on screen while this run animates so a repeat run
    // can be compared A/B during the wait; it's replaced only on success. Any
    // manual edits are dropped since they belong to the old output.
    set({
      runToken: token,
      status: "running",
      editedOutput: null,
      error: null,
      logs: [],
      liveStages: [],
      phases: freshPhases(),
    });

    // Pacing is a presentation choice: skip the fake staged latency entirely
    // when Animations is off or the user prefers reduced motion.
    const settings = useSettingsStore.getState();
    const pace =
      featureEnabledFrom(settings, "animations") && !settings.reduceMotion ? 1 : 0;

    try {
      const result = await runOptimization(
        {
          input,
          goal,
          targetBudget,
          modelId,
          contentTypeOverride,
          manualPlan,
          pace,
        },
        {
          onPhases: (phases) => {
            if (alive()) set({ phases });
          },
          onStage: (stage) => {
            if (alive()) set((state) => ({ liveStages: [...state.liveStages, stage] }));
          },
          onLog: (event) => {
            if (alive()) set((state) => ({ logs: [...state.logs, event] }));
          },
        },
      );
      if (!alive()) return;
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
      if (!alive()) return;
      // A failed run has no output to show, so clear any stale previous result.
      set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        result: null,
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

    set((s) => ({
      runToken: s.runToken + 1,
      input: result.inputText,
      goal: result.plan.goal,
      targetBudget: result.plan.targetBudget,
      modelId: entry.modelId,
      status: "done",
      result,
      editedOutput: null,
      error: null,
      liveStages: result.stages,
      logs: [],
      phases: completedPhases(),
    }));

    useHistoryStore.getState().setActive(entry.id);
  },
}));
