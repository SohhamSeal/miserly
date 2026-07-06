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
  /** True while the current run's remaining animation delays are being skipped. */
  skipPacing: boolean;

  setInput: (value: string) => void;
  setEditedOutput: (text: string | null) => void;
  /** Abandon an in-flight run, restoring the previous result if there was one. */
  cancel: () => void;
  /** Fast-forward the rest of the current run's staged animation (keep the run). */
  skipAnimation: () => void;
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

/**
 * The single in-flight run's AbortController, kept outside Zustand state (it is
 * not render data). `beginRun` aborts any previous run and returns a fresh one;
 * `endRun` clears it if it is still the current one.
 */
let activeController: AbortController | null = null;
function abortActiveRun() {
  activeController?.abort();
  activeController = null;
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
  skipPacing: false,

  setEditedOutput: (text) => set({ editedOutput: text }),

  cancel: () => {
    if (get().status !== "running") return;
    // Actually stop the engine (it checks the signal at every stage/nap) so a
    // cancelled run stops computing instead of racing on in the background.
    abortActiveRun();
    set((s) => {
      const runToken = s.runToken + 1;
      // If this run superseded a previous result, fall back to showing it —
      // preserving any manual edits the user had made to it; otherwise there's
      // nothing to show so return to the empty idle state.
      return s.result
        ? {
            runToken,
            status: "done" as const,
            phases: completedPhases(),
            liveStages: s.result.stages,
            skipPacing: false,
          }
        : {
            runToken,
            status: "idle" as const,
            phases: freshPhases(),
            liveStages: [],
            logs: [],
            skipPacing: false,
          };
    });
  },

  skipAnimation: () => {
    if (get().status === "running") set({ skipPacing: true });
  },

  setInput: (value) => {
    if (get().status === "running") {
      // Editing the input invalidates an in-flight run: abort the engine, bump
      // the token so its (now stale) result is dropped, and drop back to idle so
      // the UI doesn't hang on a spinner for a run that can no longer match
      // what's on screen.
      abortActiveRun();
      set((s) => ({
        input: value,
        runToken: s.runToken + 1,
        status: "idle",
        phases: freshPhases(),
        liveStages: [],
        logs: [],
        skipPacing: false,
      }));
    } else {
      set({ input: value });
    }
  },
  setModelId: (id) => set({ modelId: id }),
  setGoal: (goal) => set({ goal }),
  setTargetBudget: (tokens) => set({ targetBudget: tokens }),

  loadSample: (id) => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    abortActiveRun();
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
      skipPacing: false,
    }));
  },

  clearInput: () => {
    abortActiveRun();
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
      skipPacing: false,
    }));
  },

  reset: () => {
    abortActiveRun();
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
      skipPacing: false,
    }));
  },

  optimize: async () => {
    const { input, goal, targetBudget, modelId, status } = get();
    if (status === "running" || input.trim() === "") return;

    // Manual pipeline + content-type override come from the Pipeline Builder.
    // Snapshot the config NOW, at run start — the result is computed with this
    // config, so recording it (below) with a mid-run-edited config would
    // mislabel the run. buildManualPlan/history both read from this snapshot.
    const pipeline = usePipelineStore.getState();
    const configSnapshot = {
      mode: pipeline.mode,
      contentType: pipeline.contentType,
      stages: pipeline.stages.map((s) => ({ ...s })),
    };
    const manualPlan =
      configSnapshot.mode === "manual" ? pipeline.toManualPlan() : undefined;
    const contentTypeOverride =
      configSnapshot.contentType !== "auto"
        ? configSnapshot.contentType
        : // When auto-detect is off and no explicit type is chosen, use a neutral plan.
          runtime.autoDetect
          ? undefined
          : "mixed";

    // Tag this run. If the user clears the input, loads a sample, resets, or
    // re-opens a history entry mid-run, the token changes and every write below
    // is dropped — otherwise a slow run would "resurrect" its stale result.
    const token = get().runToken + 1;
    const alive = () => get().runToken === token;
    // Abort any previous run and create this run's controller.
    abortActiveRun();
    const controller = new AbortController();
    activeController = controller;
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
      skipPacing: false,
    });

    // Pacing is a presentation choice: skip the fake staged latency entirely
    // when Animations is off or the user prefers reduced motion. `getPace` is
    // read live so the "Skip" control can fast-forward the rest of a run.
    const settings = useSettingsStore.getState();
    const animate =
      featureEnabledFrom(settings, "animations") && !settings.reduceMotion;
    const getPace = () => (get().skipPacing || !animate ? 0 : 1);

    try {
      const result = await runOptimization(
        {
          input,
          goal,
          targetBudget,
          modelId,
          contentTypeOverride,
          manualPlan,
          pace: animate ? 1 : 0,
          getPace,
          signal: controller.signal,
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
      set({ status: "done", result, skipPacing: false });

      // Capture the run for the session history, using the config we snapshotted
      // at run start (not the possibly-edited live config).
      useHistoryStore.getState().record({
        id: result.id,
        createdAt: result.createdAt,
        modelId,
        pipelineMode: configSnapshot.mode,
        pipelineContentType: configSnapshot.contentType,
        pipelineStages: configSnapshot.stages,
        result,
      });
    } catch (err) {
      // A superseded/cancelled run aborts — its state was already handled by the
      // action that superseded it, so don't clobber the new state.
      if (!alive() || controller.signal.aborted) return;
      // A failed run has no output to show, so clear any stale previous result.
      set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        result: null,
        skipPacing: false,
      });
    } finally {
      if (activeController === controller) activeController = null;
    }
  },

  loadFromHistory: (entry) => {
    const { result } = entry;
    // Re-opening a past run supersedes any in-flight one.
    abortActiveRun();
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
      skipPacing: false,
    }));

    useHistoryStore.getState().setActive(entry.id);
  },
}));
