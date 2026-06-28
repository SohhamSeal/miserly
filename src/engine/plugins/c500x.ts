import { collapseWhitespace, extractiveSummary, genericTokenReduce } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "500xcompressor",
    name: "500xCompressor",
    description:
      "Extreme prompt compression into a tiny, high-density representation. Maximum token savings at the cost of some fidelity.",
    author: "research",
    version: "0.1",
    category: "summarization",
    capabilities: ["extreme summary", "density maximization"],
    supportedTypes: ["prose", "mixed", "knowledge", "markdown"],
    ratioRange: [0.04, 0.12],
    real: false,
    accent: "purple",
  },
  (args) => {
    const { text, notes } = compose(args.text, [
      (t) => extractiveSummary(t, 0.1),
      (t) => genericTokenReduce(t, 0.9),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.7, 0.95) };
  },
);
