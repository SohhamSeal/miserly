import {
  collapseWhitespace,
  dedupeConsecutiveLines,
  minifyJsonBlocks,
  normalizeNoise,
  truncateStackTraces,
} from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "headroom",
    name: "Headroom",
    description:
      "Structural compressor for tool outputs, logs, JSON and code. Normalizes high-entropy noise, dedups, minifies JSON and trims stack traces — losslessly reversible in the real engine.",
    author: "miserly",
    version: "2.x",
    category: "structural",
    capabilities: ["JSON minify", "line dedup", "stack-trace trim", "noise normalize"],
    supportedTypes: ["logs", "json", "code", "stacktrace", "sql", "mixed"],
    ratioRange: [0.28, 0.5],
    provenance: "reference-sim",
    inspiredBy: {
      name: "headroom by chopratejas",
      url: "https://github.com/chopratejas/headroom",
    },
    accent: "indigo",
  },
  (args) => {
    const a = args.config.aggressiveness;
    const { text, notes } = compose(args.text, [
      normalizeNoise,
      minifyJsonBlocks,
      dedupeConsecutiveLines,
      (t) => truncateStackTraces(t, a > 0.7 ? 3 : 6),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.97, a) };
  },
);
