import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODEL_ID, type OptimizationGoal } from "@/engine";
import { setRuntimeConfig } from "@/config/runtime";
import {
  FEATURE_AVAILABILITY,
  FEATURE_ENV_DEFAULT,
  type FeatureKey,
} from "@/features";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface SettingsState {
  // --- General preferences (runtime, persisted to localStorage) ---
  theme: ThemeMode;
  reduceMotion: boolean;
  autoDetect: boolean;
  defaultGoal: OptimizationGoal;
  defaultModelId: string;
  showGuide: boolean;
  /**
   * Whether the run-history sidebar is expanded. Intentionally NOT persisted —
   * every page load starts collapsed (the slim rail), so it never pops open on
   * its own after a reload. Toggling still works within a session.
   */
  historyOpen: boolean;

  // --- Per-feature runtime overrides (undefined = use build-time default) ---
  featureOverrides: Partial<Record<FeatureKey, boolean>>;

  /** Port of the local miserly proxy the Integrations panel talks to. */
  proxyPort: number;
  /** Activity monitor: collapse untouched requests into thin timeline markers. */
  monitorHideUntouched: boolean;

  setTheme: (theme: ThemeMode) => void;
  setReduceMotion: (value: boolean) => void;
  setAutoDetect: (value: boolean) => void;
  setDefaultGoal: (goal: OptimizationGoal) => void;
  setDefaultModelId: (id: string) => void;
  setShowGuide: (value: boolean) => void;
  setHistoryOpen: (value: boolean) => void;
  setFeatureEnabled: (key: FeatureKey, enabled: boolean) => void;
  resetFeatureOverrides: () => void;
  setProxyPort: (port: number) => void;
  setMonitorHideUntouched: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      reduceMotion: prefersReducedMotion(),
      autoDetect: true,
      defaultGoal: "balanced",
      defaultModelId: DEFAULT_MODEL_ID,
      showGuide: true,
      historyOpen: false,
      featureOverrides: {},
      proxyPort: 4141,
      monitorHideUntouched: true,

      setTheme: (theme) => set({ theme }),
      setReduceMotion: (value) => set({ reduceMotion: value }),
      setAutoDetect: (value) => set({ autoDetect: value }),
      setDefaultGoal: (goal) => set({ defaultGoal: goal }),
      setDefaultModelId: (id) => set({ defaultModelId: id }),
      setShowGuide: (value) => set({ showGuide: value }),
      setHistoryOpen: (value) => set({ historyOpen: value }),
      setFeatureEnabled: (key, enabled) => {
        // Can't enable a feature whose package isn't installed.
        if (enabled && !FEATURE_AVAILABILITY[key]) return;
        set((state) => ({
          featureOverrides: { ...state.featureOverrides, [key]: enabled },
        }));
      },
      resetFeatureOverrides: () => set({ featureOverrides: {} }),
      setProxyPort: (port) => set({ proxyPort: port }),
      setMonitorHideUntouched: (value) => set({ monitorHideUntouched: value }),
    }),
    {
      name: "miserly-settings",
      version: 1,
      // NOTE: `historyOpen` is deliberately omitted — we don't want the sidebar
      // state to survive reloads.
      partialize: (state) => ({
        theme: state.theme,
        reduceMotion: state.reduceMotion,
        autoDetect: state.autoDetect,
        defaultGoal: state.defaultGoal,
        defaultModelId: state.defaultModelId,
        showGuide: state.showGuide,
        featureOverrides: state.featureOverrides,
        proxyPort: state.proxyPort,
        monitorHideUntouched: state.monitorHideUntouched,
      }),
      // Force the sidebar collapsed on every load, even if an older build had
      // persisted `historyOpen: true` into localStorage.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<SettingsState>),
        historyOpen: false,
      }),
    },
  ),
);

// ----------------------------------------------------------------------------
// Effective feature state = build-time availability + default + runtime override
// ----------------------------------------------------------------------------

/** Effective enabled-state of a feature for the given settings snapshot. */
export function featureEnabledFrom(
  state: Pick<SettingsState, "featureOverrides">,
  key: FeatureKey,
): boolean {
  if (!FEATURE_AVAILABILITY[key]) return false;
  return state.featureOverrides[key] ?? FEATURE_ENV_DEFAULT[key];
}

/** Hook: is a feature currently enabled (available + on)? */
export function useFeatureEnabled(key: FeatureKey): boolean {
  return useSettingsStore((s) => featureEnabledFrom(s, key));
}

/** Hook: are animations active (feature on AND reduce-motion off)? */
export function useAnimationsEnabled(): boolean {
  return useSettingsStore(
    (s) => featureEnabledFrom(s, "animations") && !s.reduceMotion,
  );
}

/** Hook: resolve "system" theme to a concrete light/dark value, reactively. */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useSettingsStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

// ----------------------------------------------------------------------------
// Keep the (non-React) engine runtime config in sync with settings.
// ----------------------------------------------------------------------------
function syncRuntime(state: SettingsState) {
  setRuntimeConfig({
    useAccurateTokenizer: featureEnabledFrom(state, "accurateTokenizer"),
    autoDetect: state.autoDetect,
  });
}
syncRuntime(useSettingsStore.getState());
useSettingsStore.subscribe(syncRuntime);
