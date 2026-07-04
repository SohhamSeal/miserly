/**
 * Core type system for the miserly optimization engine.
 *
 * The engine is "plugin-shaped": every optimizer implements `OptimizerPlugin`
 * and is registered in the registry. Adding a new optimizer is a single new
 * file — it then shows up automatically in the planner, pipeline, metrics and
 * logs (the extensibility goal from design.md).
 */

export type ContentType =
  | "logs"
  | "json"
  | "code"
  | "stacktrace"
  | "markdown"
  | "chat"
  | "sql"
  | "rag"
  | "knowledge"
  | "prose"
  | "mixed";

export type OptimizationGoal =
  | "balanced"
  | "max_compression"
  | "highest_quality"
  | "lowest_cost"
  | "fastest";

export type TokenizerFamily =
  | "openai"
  | "anthropic"
  | "gemini"
  | "llama"
  | "mistral"
  | "deepseek"
  | "qwen";

export interface ModelPricing {
  id: string;
  label: string;
  provider: string;
  /** USD per 1,000,000 input tokens (estimate, editable). */
  inputPerM: number;
  /** USD per 1,000,000 output tokens (estimate, editable). */
  outputPerM: number;
  /**
   * USD per 1,000,000 tokens for a CACHE READ — a prompt prefix the provider
   * already has cached from a previous, byte-identical request. Typically
   * ~10–25% of `inputPerM`. Omitted for models without standard prompt caching
   * (we don't invent a number for those). Drives the "reused prompt" advisory.
   */
  cacheReadPerM?: number;
  contextWindow: number;
  tokenizer: TokenizerFamily;
  /**
   * Optional long-context surcharge. Some providers (e.g. Gemini 2.5 Pro) bill
   * the ENTIRE request at a higher rate once the prompt crosses a token
   * threshold — not just the tokens above it.
   */
  longContext?: {
    thresholdTokens: number;
    inputPerM: number;
    outputPerM: number;
  };
}

export type PluginCategory =
  | "structural"
  | "code"
  | "semantic"
  | "retrieval"
  | "summarization"
  | "general";

export interface PluginMetadata {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: PluginCategory;
  capabilities: string[];
  supportedTypes: ContentType[];
  /** Characteristic output/input token ratio range, e.g. [0.3, 0.6]. */
  ratioRange: [number, number];
  /**
   * Where this optimizer's behavior actually comes from — the honesty signal the
   * UI surfaces:
   *  - "native": miserly's own transform; no outside lineage is claimed.
   *  - "reference-sim": a LOCAL heuristic *inspired by* published research or an
   *    existing tool (see `inspiredBy`). It approximates the idea — it is NOT
   *    that project and does not execute its code.
   *  - "external": actually delegates to a real external/local optimizer package.
   */
  provenance: Provenance;
  /**
   * The published work / project this simulation is modeled on. Only meaningful
   * for "reference-sim" plugins; it credits the lineage WITHOUT impersonating it
   * (the author stays "miserly" and the badge stays "sim").
   */
  inspiredBy?: { name: string; url?: string };
  /** Tailwind color family used for chips/bars, e.g. "indigo". */
  accent: string;
}

export type Provenance = "native" | "reference-sim" | "external";

export interface PluginConfig {
  /** 0..1 — how hard the optimizer pushes (token target pressure). */
  aggressiveness: number;
  /** 0..1 — minimum semantic similarity the stage tries to keep. */
  similarityThreshold: number;
  enabled: boolean;
}

export interface CompressArgs {
  text: string;
  classification: ClassificationResult;
  goal: OptimizationGoal;
  targetBudget: number;
  config: PluginConfig;
}

export interface CompressOutput {
  text: string;
  notes: string[];
  /** Plugin's self-estimate of how much meaning it preserved (0..1). */
  qualityScore: number;
}

export interface OptimizerPlugin {
  metadata: PluginMetadata;
  supports: (type: ContentType) => boolean;
  /** Typical output/input ratio given a goal — used for planner scoring. */
  expectedRatio: (goal: OptimizationGoal) => number;
  compress: (args: CompressArgs) => CompressOutput;
}

export interface DocumentStats {
  chars: number;
  words: number;
  lines: number;
  paragraphs: number;
  tokens: number;
  duplicateLines: number;
  uniqueLines: number;
}

export interface DetectedType {
  type: ContentType;
  /** Portion of the document (0..1). */
  share: number;
  confidence: number;
}

export interface ClassificationResult {
  primary: ContentType;
  secondary: ContentType | null;
  detected: DetectedType[];
  confidence: number;
  reasons: string[];
  language: string;
  complexity: "low" | "medium" | "high";
  stats: DocumentStats;
}

export interface PlannedStage {
  pluginId: string;
  reason: string;
  /**
   * Per-stage aggressiveness (0..1). Set by manual pipelines so each stage can
   * push harder or softer than the goal default; when omitted the runner falls
   * back to the goal's default aggressiveness.
   */
  aggressiveness?: number;
}

export interface PlanResult {
  goal: OptimizationGoal;
  targetBudget: number;
  stages: PlannedStage[];
  reasoning: string[];
  /** "sequential" = auto-planned; "manual" = user-defined Pipeline Builder run. */
  mode: "sequential" | "manual";
}

/**
 * One stage of a user-defined pipeline (Pipeline Builder). The order of the
 * array is the exact execution order — the planner's selection and category
 * reordering are bypassed entirely.
 */
export interface ManualStage {
  pluginId: string;
  /** 0..1 — how hard this stage pushes. */
  aggressiveness: number;
}

export interface StageResult {
  pluginId: string;
  name: string;
  description: string;
  status: "completed" | "skipped" | "failed";
  inputTokens: number;
  outputTokens: number;
  inputChars: number;
  outputChars: number;
  ratio: number;
  reductionPct: number;
  durationMs: number;
  qualityScore: number;
  notes: string[];
  outputText: string;
}

export interface ValidationResult {
  semanticSimilarity: number;
  informationRetention: number;
  entityRetention: number;
  confidence: number;
  accepted: boolean;
  warnings: string[];
  fallbacksUsed: string[];
}

export interface BudgetSegment {
  label: string;
  tokens: number;
  /** Tailwind color family, e.g. "indigo". */
  accent: string;
}

export interface OptimizationResult {
  id: string;
  inputText: string;
  outputText: string;
  /** Base (OpenAI) token counts — per-model counts derive from these. */
  originalTokens: number;
  optimizedTokens: number;
  originalChars: number;
  optimizedChars: number;
  classification: ClassificationResult;
  plan: PlanResult;
  stages: StageResult[];
  validation: ValidationResult;
  totalDurationMs: number;
  budgetBefore: BudgetSegment[];
  budgetAfter: BudgetSegment[];
  createdAt: number;
}

export type PhaseId =
  | "analysis"
  | "classification"
  | "planning"
  | "compression"
  | "validation"
  | "assembly";

export type PhaseStatus = "waiting" | "running" | "completed" | "failed";

export interface PipelinePhase {
  id: PhaseId;
  label: string;
  description: string;
  status: PhaseStatus;
  detail?: string;
  durationMs?: number;
}

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEvent {
  ts: number;
  level: LogLevel;
  message: string;
}

export interface RunOptions {
  input: string;
  goal: OptimizationGoal;
  targetBudget: number;
  contentTypeOverride?: ContentType | "auto";
  enabledPluginIds?: string[];
  /**
   * Explicit, user-defined pipeline. When provided (even as an empty array),
   * the auto-planner is bypassed and exactly these stages run in this order.
   */
  manualPlan?: ManualStage[];
  modelId: string;
  /**
   * Presentation pacing for the staged run, 0..1. 1 = full animated stage
   * delays; 0 = no artificial delay (used when the Animations feature is off or
   * the user prefers reduced motion). Defaults to full so a headless caller
   * must opt out explicitly. This is the only spot UI pacing touches the engine
   * — a proper injected pace callback is a later refactor.
   */
  pace?: number;
}

export interface RunCallbacks {
  onPhases?: (phases: PipelinePhase[]) => void;
  onStage?: (stage: StageResult, index: number, total: number) => void;
  onLog?: (event: LogEvent) => void;
}
