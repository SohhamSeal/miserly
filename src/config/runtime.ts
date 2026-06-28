/**
 * Runtime configuration bridge.
 *
 * Engine code (the tokenizer, the classifier) is plain TypeScript with no React
 * dependency, but some of its behavior is controlled by live user settings
 * (e.g. "use the accurate tokenizer", "auto-detect content type"). Rather than
 * coupling the engine to the React settings store, the store pushes the few
 * values the engine cares about into this tiny mutable singleton.
 */
export interface RuntimeConfig {
  /** Use the exact tokenizer (only effective when gpt-tokenizer is installed). */
  useAccurateTokenizer: boolean;
  /** Auto-detect the content type on each run. */
  autoDetect: boolean;
}

export const runtime: RuntimeConfig = {
  useAccurateTokenizer: false,
  autoDetect: true,
};

export function setRuntimeConfig(patch: Partial<RuntimeConfig>): void {
  Object.assign(runtime, patch);
}
