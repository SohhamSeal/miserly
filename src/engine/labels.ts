import type {
  ContentType,
  OptimizationGoal,
  PhaseId,
  PluginCategory,
} from "./types";

/**
 * Shared display metadata. Using `Record<Union, ...>` here means adding a new
 * ContentType / Goal / Category to the union forces a compile error until it
 * is labelled — keeping the UI and engine in sync.
 */

export const TYPE_LABELS: Record<ContentType, string> = {
  logs: "Logs",
  json: "JSON",
  code: "Code",
  stacktrace: "Stack traces",
  markdown: "Markdown",
  chat: "Chat history",
  sql: "SQL",
  rag: "RAG documents",
  knowledge: "Knowledge base",
  prose: "Prose",
  mixed: "Mixed",
};

/** Tailwind color family per content type (used for chips and budget bars). */
export const TYPE_ACCENT: Record<ContentType, string> = {
  logs: "amber",
  json: "sky",
  code: "emerald",
  stacktrace: "rose",
  markdown: "violet",
  chat: "fuchsia",
  sql: "cyan",
  rag: "teal",
  knowledge: "indigo",
  prose: "slate",
  mixed: "primary",
};

export const GOAL_LABELS: Record<OptimizationGoal, string> = {
  balanced: "Balanced",
  max_compression: "Maximum compression",
  highest_quality: "Highest quality",
  lowest_cost: "Lowest cost",
  fastest: "Fastest",
};

export const GOAL_HINTS: Record<OptimizationGoal, string> = {
  balanced: "A sensible mix of compression and fidelity.",
  max_compression: "Squeeze tokens as hard as possible.",
  highest_quality: "Preserve as much meaning as possible.",
  lowest_cost: "Optimize for the cheapest possible API bill.",
  fastest: "Fewest, quickest stages.",
};

export const CATEGORY_LABELS: Record<PluginCategory, string> = {
  structural: "Structural",
  code: "Code",
  semantic: "Semantic",
  retrieval: "Retrieval",
  summarization: "Summarization",
  general: "General",
};

export const PHASE_INFO: Array<{
  id: PhaseId;
  label: string;
  description: string;
}> = [
  {
    id: "analysis",
    label: "Input analysis",
    description: "Tokenize and gather document statistics",
  },
  {
    id: "classification",
    label: "Document classification",
    description: "Detect content types and confidence",
  },
  {
    id: "planning",
    label: "Strategy planning",
    description: "Choose and order the optimizer pipeline",
  },
  {
    id: "compression",
    label: "Compression",
    description: "Run the selected optimizers in sequence",
  },
  {
    id: "validation",
    label: "Validation",
    description: "Check similarity and information retention",
  },
  {
    id: "assembly",
    label: "Final assembly",
    description: "Assemble the optimized output and report",
  },
];
