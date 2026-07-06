import { collapseWhitespace, genericTokenReduce } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "llmlingua",
    name: "LLMLingua",
    description:
      "Token-level prompt compression. Drops low-information filler tokens from prose and chat while preserving the meaning a model needs. (Approximation of the LLMLingua idea using deterministic filler removal — not a perplexity model.)",
    author: "miserly",
    version: "1.x",
    category: "semantic",
    // Honest capability list: this is deterministic filler/stopword pruning, not
    // the perplexity-scored token dropping the real LLMLingua paper performs.
    capabilities: ["filler-token pruning", "whitespace collapse"],
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
