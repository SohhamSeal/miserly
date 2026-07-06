import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ContentType, OptimizationResult } from "@/engine";
import type { PipelineMode, PipelineStageConfig } from "@/store/usePipelineStore";

/**
 * A single optimization run, captured so it can be re-opened later in the
 * session. We store only what the {@link OptimizationResult} doesn't already
 * carry (model + the Pipeline Builder config), plus the result itself for an
 * instant report — `input`, `goal` and `targetBudget` are read back off the
 * result on restore to avoid duplicating large text.
 */
export interface HistoryEntry {
  /** Reuses the run's result id — unique per run. */
  id: string;
  createdAt: number;
  modelId: string;
  pipelineMode: PipelineMode;
  pipelineContentType: ContentType | "auto";
  pipelineStages: PipelineStageConfig[];
  result: OptimizationResult;
}

/** Keep memory + sessionStorage bounded; oldest runs fall off the end. */
const MAX_ENTRIES = 20;

interface HistoryState {
  /** Newest first. */
  entries: HistoryEntry[];
  /** The run currently loaded into the studio (for list highlighting). */
  activeId: string | null;

  record: (entry: HistoryEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
  setActive: (id: string | null) => void;
}

/**
 * sessionStorage that swallows errors. A very large run could exceed the
 * ~5MB quota; if so we simply skip persisting it (it still works in-memory for
 * the session) rather than letting the write throw and break state updates.
 */
const safeSessionStorage = createJSONStorage(() => ({
  getItem: (name: string): string | null => {
    try {
      return sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      sessionStorage.setItem(name, value);
    } catch {
      /* quota / private-mode — ignore, keep working in memory */
    }
  },
  removeItem: (name: string): void => {
    try {
      sessionStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
}));

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      activeId: null,

      record: (entry) =>
        set((state) => ({
          // De-dupe by id (re-recording the same run just moves it to the top)
          // and cap the list length.
          entries: [
            entry,
            ...state.entries.filter((e) => e.id !== entry.id),
          ].slice(0, MAX_ENTRIES),
          activeId: entry.id,
        })),

      remove: (id) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
          activeId: state.activeId === id ? null : state.activeId,
        })),

      clear: () => set({ entries: [], activeId: null }),

      setActive: (id) => set({ activeId: id }),
    }),
    {
      name: "miserly-history",
      version: 1,
      storage: safeSessionStorage,
      // Persist only the entries, never `activeId`: the studio store that holds
      // the actual loaded run is NOT persisted, so on reload nothing is really
      // "active". Persisting activeId would highlight a run in the sidebar while
      // the studio shows the empty state — a desync. It starts null every load.
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);
