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
  contextWindow: number;
  tokenizer: TokenizerFamily;
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
  /** True when this maps to a real, local/external optimizer (vs. illustrative). */
  real: boolean;
  homepage?: string;
  /** Tailwind color family used for chips/bars, e.g. "indigo". */
  accent: string;
}

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
}

export interface PlanResult {
  goal: OptimizationGoal;
  targetBudget: number;
  stages: PlannedStage[];
  reasoning: string[];
  mode: "sequential";
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
  modelId: string;
}

export interface RunCallbacks {
  onPhases?: (phases: PipelinePhase[]) => void;
  onStage?: (stage: StageResult, index: number, total: number) => void;
  onLog?: (event: LogEvent) => void;
}
