import { collapseWhitespace, dedupeGlobalLines, dropLowInfoLines } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "claw",
    name: "Claw",
    description:
      "Aggressive structural pruning that claws out boilerplate, separators and low-signal lines from noisy mixed dumps.",
    author: "miserly",
    version: "0.2",
    category: "structural",
    capabilities: ["boilerplate removal", "global dedup", "low-signal pruning"],
    // JSON is deliberately excluded: Claw prunes and dedupes whole lines, which
    // is destructive on structured data. The segmenter also guards it, but it
    // shouldn't be a planner candidate for JSON in the first place.
    supportedTypes: ["logs", "mixed", "stacktrace"],
    ratioRange: [0.4, 0.6],
    provenance: "reference-sim",
    accent: "rose",
  },
  (args) => {
    // Honor the slider instead of forcing a 0.6 floor; a light floor keeps Claw
    // recognizably "aggressive" without overriding an explicit low setting.
    const a = Math.max(0.4, args.config.aggressiveness);
    const { text, notes } = compose(args.text, [
      (t) => dropLowInfoLines(t, a),
      dedupeGlobalLines,
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.88, a) };
  },
);
