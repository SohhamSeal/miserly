import { collapseWhitespace, genericTokenReduce } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "llmlingua",
    name: "LLMLingua",
    description:
      "Token-level prompt compression. Drops low-information tokens from prose and chat while preserving the meaning a model needs.",
    author: "miserly",
    version: "1.x",
    category: "semantic",
    capabilities: ["token pruning", "perplexity-guided drop"],
    supportedTypes: ["prose", "chat", "markdown", "mixed", "rag"],
    ratioRange: [0.25, 0.5],
    provenance: "reference-sim",
    inspiredBy: {
      name: "LLMLingua (Microsoft Research)",
      url: "https://github.com/microsoft/LLMLingua",
    },
    accent: "violet",
  },
  (args) => {
    const a = args.config.aggressiveness;
    const { text, notes } = compose(args.text, [
      (t) => genericTokenReduce(t, a),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.9, a) };
  },
);
