import {
  collapseWhitespace,
  dedupeGlobalLines,
  minifyJsonBlocks,
  truncateStackTraces,
} from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "toonify",
    name: "Toonify",
    description:
      "Converts repetitive structured blocks into a compact, token-efficient form (TOON-style) and collapses recurring traces and duplicate records.",
    author: "community",
    version: "0.4",
    category: "structural",
    capabilities: ["structured rewrite", "global dedup", "trace collapse"],
    supportedTypes: ["json", "logs", "stacktrace", "mixed"],
    ratioRange: [0.45, 0.7],
    real: false,
    accent: "sky",
  },
  (args) => {
    const a = args.config.aggressiveness;
    const { text, notes } = compose(args.text, [
      minifyJsonBlocks,
      dedupeGlobalLines,
      (t) => truncateStackTraces(t, 3),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.94, a) };
  },
);
