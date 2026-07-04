import { collapseWhitespace, extractiveSummary, genericTokenReduce } from "../transforms";
import { aggressivenessKeep, compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "xrag",
    name: "xRAG",
    description:
      "Extreme RAG compression. Distills retrieved passages into a dense note — very high compression, intended for recall-tolerant retrieval.",
    author: "miserly",
    version: "0.1",
    category: "retrieval",
    capabilities: ["extreme distillation", "dense note"],
    supportedTypes: ["rag", "knowledge"],
    ratioRange: [0.04, 0.15],
    provenance: "reference-sim",
    inspiredBy: { name: "xRAG (research)" },
    accent: "cyan",
  },
  (args) => {
    const a = Math.max(0.6, args.config.aggressiveness);
    const { text, notes } = compose(args.text, [
      (t) => extractiveSummary(t, aggressivenessKeep([0.04, 0.15], args.config.aggressiveness)),
      (t) => genericTokenReduce(t, a),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.72, a) };
  },
);
