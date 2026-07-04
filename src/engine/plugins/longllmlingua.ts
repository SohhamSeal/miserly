import { collapseWhitespace, dropLowInfoLines, genericTokenReduce } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "longllmlingua",
    name: "LongLLMLingua",
    description:
      "Long-context, question-aware compression. Reorders and prunes large documents and RAG passages to keep what answers the query.",
    author: "miserly",
    version: "1.x",
    category: "semantic",
    capabilities: ["long-context pruning", "question-aware", "token drop"],
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
