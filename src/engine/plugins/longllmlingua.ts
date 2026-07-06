import { collapseWhitespace, dropLowInfoLines, genericTokenReduce } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "longllmlingua",
    name: "LongLLMLingua",
    description:
      "Long-context pruning for large documents and RAG passages: drops low-information lines and filler tokens. (Approximation of the LongLLMLingua idea — it does not yet reorder by or condition on a question.)",
    author: "miserly",
    version: "1.x",
    category: "semantic",
    // Honest capability list: no query conditioning or reordering is implemented
    // yet — those are the parts of the real LongLLMLingua this only gestures at.
    capabilities: ["low-information line pruning", "filler-token pruning"],
    supportedTypes: ["rag", "knowledge", "prose", "mixed", "chat"],
    ratioRange: [0.18, 0.4],
    provenance: "reference-sim",
    inspiredBy: {
      name: "LongLLMLingua (Microsoft Research)",
      url: "https://github.com/microsoft/LLMLingua",
    },
    accent: "fuchsia",
  },
  (args) => {
    const a = Math.max(0.5, args.config.aggressiveness);
    const { text, notes } = compose(args.text, [
      (t) => dropLowInfoLines(t, a),
      (t) => genericTokenReduce(t, Math.min(1, a + 0.1)),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.88, a) };
  },
);
