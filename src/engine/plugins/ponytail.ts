import { collapseWhitespace, dropLowInfoLines, stripComments } from "../transforms";
import { compose, definePlugin, qualityOf } from "./_base";

export default definePlugin(
  {
    id: "ponytail",
    name: "Ponytail",
    description:
      "Lazy-senior-dev code reducer. Strips comments and ceremony and keeps the one line that matters — best on verbose source files.",
    author: "DietrichGebert",
    version: "4.x",
    category: "code",
    capabilities: ["comment strip", "ceremony removal", "whitespace squeeze"],
    supportedTypes: ["code", "mixed"],
    ratioRange: [0.5, 0.75],
    real: true,
    homepage: "https://github.com/DietrichGebert/ponytail",
    accent: "amber",
  },
  (args) => {
    const a = args.config.aggressiveness;
    const { text, notes } = compose(args.text, [
      stripComments,
      (t) => dropLowInfoLines(t, a),
      collapseWhitespace,
    ]);
    return { text, notes, qualityScore: qualityOf(0.9, a) };
  },
);
