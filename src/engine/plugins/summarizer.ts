import { collapseWhitespace, extractiveSummary } from "../transforms";
import { compose, definePlugin, goalRatio, qualityOf } from "./_base";

const RANGE: [number, number] = [0.2, 0.45];

export default definePlugin(
  {
    id: "summarizer",
    name: "Summarizer",
    description:
      "General-purpose summarizer for prose, docs and chats. A safe default when the content does not fit a more specialized optimizer.",
    author: "miserly",
    version: "1.0",
    category: "summarization",
    capabilities: ["extractive summary", "general purpose"],
    supportedTypes: ["prose", "markdown", "chat", "knowledge", "mixed"],
    ratioRange: RANGE,
    real: false,
    accent: "slate",
  },
  (args) => {
    const keep = goalRatio(RANGE, args.goal);
    const { text, notes } = compose(args.text, [
      (t) => extractiveSummary(t, keep),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.86, args.config.aggressiveness) };
  },
);
