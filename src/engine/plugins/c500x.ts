import { collapseWhitespace, extractiveSummary, genericTokenReduce } from "../transforms";
import { aggressivenessKeep, compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "500xcompressor",
    name: "500xCompressor",
    description:
      "Extreme prompt compression into a tiny, high-density representation. Maximum token savings at the cost of some fidelity.",
    author: "miserly",
    version: "0.1",
    category: "summarization",
    capabilities: ["extreme summary", "density maximization"],
    supportedTypes: ["prose", "mixed", "knowledge", "markdown"],
    ratioRange: [0.04, 0.12],
    provenance: "reference-sim",
    inspiredBy: { name: "500xCompressor (research)" },
    accent: "purple",
  },
  (args) => {
    const a = Math.max(0.6, args.config.aggressiveness);
    const { text, notes } = compose(args.text, [
      (t) => extractiveSummary(t, aggressivenessKeep([0.04, 0.12], args.config.aggressiveness)),
      (t) => genericTokenReduce(t, a),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.7, a) };
  },
);
