import { collapseWhitespace, dropLowInfoLines, extractiveSummary } from "../transforms";
import { compose, definePlugin, goalRatio, qualityOf } from "./_base";

const RANGE: [number, number] = [0.12, 0.3];

export default definePlugin(
  {
    id: "nuggets",
    name: "Nuggets",
    description:
      "Extracts information 'nuggets' — the load-bearing facts, entities and decisions — and discards the connective tissue.",
    author: "community",
    version: "0.3",
    category: "retrieval",
    capabilities: ["fact extraction", "salience ranking"],
    supportedTypes: ["knowledge", "rag", "prose", "chat"],
    ratioRange: RANGE,
    real: false,
    accent: "emerald",
  },
  (args) => {
    const keep = goalRatio(RANGE, args.goal);
    const { text, notes } = compose(args.text, [
      (t) => extractiveSummary(t, keep),
      (t) => dropLowInfoLines(t, 0.7),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.82, args.config.aggressiveness) };
  },
);
