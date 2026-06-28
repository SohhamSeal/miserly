import type { OptimizerPlugin } from "./types";

/**
 * Plugin registry — the heart of miserly's extensibility.
 *
 * Vite's `import.meta.glob` eagerly imports every file in `./plugins`. Any file
 * that default-exports an `OptimizerPlugin` is registered automatically, so a
 * brand-new optimizer appears in the planner, pipeline, comparison, metrics and
 * logs the moment you drop its file in — zero other changes required.
 */
const modules = import.meta.glob("./plugins/*.ts", { eager: true });

export const PLUGINS: OptimizerPlugin[] = Object.values(modules)
  .map((m) => (m as { default?: OptimizerPlugin }).default)
  .filter((p): p is OptimizerPlugin => Boolean(p && p.metadata))
  .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

const byId = new Map(PLUGINS.map((p) => [p.metadata.id, p]));

export function getPlugin(id: string): OptimizerPlugin | undefined {
  return byId.get(id);
}
