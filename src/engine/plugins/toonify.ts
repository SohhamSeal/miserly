import {
  collapseWhitespace,
  dedupeGlobalLines,
  toonifyJsonBlocks,
  truncateStackTraces,
} from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "toonify",
    name: "Toonify",
    description:
      "Re-encodes JSON the TOON way: uniform record arrays become a table whose keys are declared once, and a measured token count decides — per block — whether the table or plain minified JSON ships. Also collapses recurring traces and duplicate records.",
    author: "miserly",
    version: "1.0",
    category: "structural",
    capabilities: [
      "TOON table encoding",
      "measured JSON fallback",
      "global dedup",
      "trace collapse",
    ],
    supportedTypes: ["json", "logs", "stacktrace", "mixed"],
    ratioRange: [0.3, 0.6],
    provenance: "native",
    inspiredBy: { name: "TOON (Token-Oriented Object Notation)" },
    accent: "sky",
  },
  (args) => {
    const a = args.config.aggressiveness;
    const { text, notes } = compose(args.text, [
      toonifyJsonBlocks,
      dedupeGlobalLines,
      (t) => truncateStackTraces(t, 3),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.94, a) };
  },
);
