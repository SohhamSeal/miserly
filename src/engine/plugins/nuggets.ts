import { collapseWhitespace, dropLowInfoLines, extractiveSummary } from "../transforms";
import { aggressivenessKeep, compose, definePlugin, qualityOf } from "./_base";

const RANGE: [number, number] = [0.12, 0.3];

export default definePlugin(
  {
    id: "nuggets",
    name: "Nuggets",
    description:
      "Extracts information 'nuggets' — the load-bearing facts, entities and decisions — and discards the connective tissue.",
    author: "miserly",
    version: "0.3",
    category: "retrieval",
    capabilities: ["fact extraction", "salience ranking"],
    supportedTypes: ["knowledge", "rag", "prose", "chat"],
    ratioRange: RANGE,
    provenance: "reference-sim",
    inspiredBy: { name: "information-nugget extraction (community concept)" },
    accent: "emerald",
  },
  (args) => {
    const a = args.config.aggressiveness;
    const keep = aggressivenessKeep(RANGE, a);
    const { text, notes } = compose(args.text, [
      (t) => extractiveSummary(t, keep),
      (t) => dropLowInfoLines(t, a),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.82, a) };
  },
);
