// =============================================================================
// miserly — canonical feature catalog (single source of truth)
// =============================================================================
//
// This file is the ONE place that describes every optional feature of miserly.
// It is consumed by:
//   • scripts/generate.mjs      → generates src/features.generated.ts and the
//                                  integration adapters that the app imports.
//   • scripts/setup.mjs         → the interactive `npm run setup` installer.
//   • scripts/install-feature.mjs → the per-feature installer (also used by the
//                                  in-app "Install" button via the dev server).
//
// It is plain ESM JavaScript (no TypeScript / no build step) so that Node can
// import it directly without any tooling.
//
// Adding a feature = add one entry here, then re-run `npm run setup` (or just
// `node scripts/generate.mjs`). No other file needs to change.
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} FeatureDef
 * @property {string}   key          Stable identifier used in code + storage.
 * @property {string}   envVar       The `VITE_FEATURE_*` build-time flag name.
 * @property {string}   label        Human label shown in the Settings UI.
 * @property {string}   description  One-line explanation for the Settings UI.
 * @property {boolean}  heavy        True if it pulls a large npm package.
 * @property {string[]} packages     npm packages to install when enabled ([] = none).
 * @property {string|null} sizeLabel Approx install size, shown in the UI.
 * @property {boolean}  default      Default ON/OFF (heavy features default OFF).
 * @property {boolean}  runtimeToggle Whether it can be toggled live in the browser.
 * @property {string|null} integration Adapter id this feature backs, if any.
 */

/** @type {FeatureDef[]} */
export const FEATURES = [
  {
    key: "accurateTokenizer",
    envVar: "VITE_FEATURE_ACCURATE_TOKENIZER",
    label: "Accurate tokenizer",
    description:
      "Exact OpenAI token counts via gpt-tokenizer. Without it, miserly uses a fast ~4-characters-per-token estimate.",
    heavy: true,
    packages: ["gpt-tokenizer"],
    sizeLabel: "~55 MB",
    default: false,
    runtimeToggle: true,
    integration: "tokenizer",
  },
  {
    key: "documentParsing",
    envVar: "VITE_FEATURE_DOCUMENT_PARSING",
    label: "Document parsing (PDF / DOCX)",
    description:
      "Extract text from uploaded PDF and Word documents using pdfjs-dist and mammoth.",
    heavy: true,
    packages: ["pdfjs-dist", "mammoth"],
    sizeLabel: "~20 MB",
    default: false,
    runtimeToggle: true,
    integration: "docparse",
  },
  {
    key: "animations",
    envVar: "VITE_FEATURE_ANIMATIONS",
    label: "Animations",
    description:
      "Smooth motion for the live pipeline and transitions. Turn off for a calmer, snappier UI.",
    heavy: false,
    packages: [],
    sizeLabel: null,
    default: true,
    runtimeToggle: true,
    integration: null,
  },
  {
    key: "richEditor",
    envVar: "VITE_FEATURE_RICH_EDITOR",
    label: "Rich code editor",
    description:
      "Syntax-highlighted CodeMirror editor for input and output. When off, a plain fast textarea is used.",
    heavy: false,
    packages: [],
    sizeLabel: null,
    default: true,
    runtimeToggle: true,
    integration: null,
  },
  {
    key: "costComparison",
    envVar: "VITE_FEATURE_COST_COMPARISON",
    label: "Cost comparison",
    description: "Before / after USD cost estimates for the selected model.",
    heavy: false,
    packages: [],
    sizeLabel: null,
    default: true,
    runtimeToggle: true,
    integration: null,
  },
  {
    key: "contextBudget",
    envVar: "VITE_FEATURE_CONTEXT_BUDGET",
    label: "Context budget",
    description:
      "Visualize how tokens are allocated across content types, before and after optimization.",
    heavy: false,
    packages: [],
    sizeLabel: null,
    default: true,
    runtimeToggle: true,
    integration: null,
  },
  {
    key: "sampleDocuments",
    envVar: "VITE_FEATURE_SAMPLE_DOCUMENTS",
    label: "Sample documents",
    description: "One-click realistic examples (logs, code, RAG, chat, JSON) to try the studio.",
    heavy: false,
    packages: [],
    sizeLabel: null,
    default: true,
    runtimeToggle: true,
    integration: null,
  },
];

/** Feature keys, in catalog order. */
export const FEATURE_KEYS = FEATURES.map((f) => f.key);

/** Look up a single feature definition by key. */
export function getFeature(key) {
  return FEATURES.find((f) => f.key === key) ?? null;
}

/** Features that pull at least one npm package (the install-optional ones). */
export const HEAVY_FEATURES = FEATURES.filter((f) => f.packages.length > 0);

/** The default enabled-state map, e.g. { accurateTokenizer: false, animations: true, ... }. */
export function defaultFlagMap() {
  /** @type {Record<string, boolean>} */
  const map = {};
  for (const f of FEATURES) map[f.key] = f.default;
  return map;
}
