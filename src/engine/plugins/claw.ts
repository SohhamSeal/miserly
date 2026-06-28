import { collapseWhitespace, dedupeGlobalLines, dropLowInfoLines } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "claw",
    name: "Claw",
    description:
      "Aggressive structural pruning that claws out boilerplate, separators and low-signal lines from noisy mixed dumps.",
    author: "community",
    version: "0.2",
    category: "structural",
    capabilities: ["boilerplate removal", "global dedup", "low-signal pruning"],
    supportedTypes: ["logs", "mixed", "json", "stacktrace"],
    ratioRange: [0.4, 0.6],
    real: false,
    accent: "rose",
  },
  (args) => {
    const a = Math.max(0.6, args.config.aggressiveness);
    const { text, notes } = compose(args.text, [
      (t) => dropLowInfoLines(t, a),
      dedupeGlobalLines,
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.88, a) };
  },
);
