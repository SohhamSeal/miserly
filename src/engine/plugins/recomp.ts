import { collapseWhitespace, extractiveSummary } from "../transforms";
import { compose, definePlugin, goalRatio, qualityOf } from "./_base";

const RANGE: [number, number] = [0.15, 0.35];

export default definePlugin(
  {
    id: "recomp",
    name: "RECOMP",
    description:
      "Retrieval compressor. Produces an abstractive + extractive summary of retrieved passages so only the relevant evidence reaches the model.",
    author: "research",
    version: "1.x",
    category: "retrieval",
    capabilities: ["extractive summary", "passage selection"],
    supportedTypes: ["rag", "knowledge", "prose"],
    ratioRange: RANGE,
    real: false,
    accent: "teal",
  },
  (args) => {
    const keep = goalRatio(RANGE, args.goal);
    const { text, notes } = compose(args.text, [
      (t) => extractiveSummary(t, keep),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.85, args.config.aggressiveness) };
  },
);
