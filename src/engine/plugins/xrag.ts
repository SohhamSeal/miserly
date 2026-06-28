import { collapseWhitespace, extractiveSummary, genericTokenReduce } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "xrag",
    name: "xRAG",
    description:
      "Extreme RAG compression. Distills retrieved passages into a dense note — very high compression, intended for recall-tolerant retrieval.",
    author: "research",
    version: "0.1",
    category: "retrieval",
    capabilities: ["extreme distillation", "dense note"],
    supportedTypes: ["rag", "knowledge"],
    ratioRange: [0.04, 0.15],
    real: false,
    accent: "cyan",
  },
  (args) => {
    const { text, notes } = compose(args.text, [
      (t) => extractiveSummary(t, 0.12),
      (t) => genericTokenReduce(t, 0.85),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.72, 0.9) };
  },
);
