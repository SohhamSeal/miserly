import { clamp, sleep } from "@/lib/utils";
import { formatCompact, formatNumber } from "@/lib/format";
import { buildBudgetAfter, buildBudgetBefore } from "./budget";
import { classify } from "./classifier";
import { GOAL_LABELS, PHASE_INFO, TYPE_LABELS } from "./labels";
import { planPipeline } from "./planner";
import { defaultAggressiveness } from "./plugins/_base";
import { getPlugin } from "./registry";
import { countTokens } from "./tokenizer";
import type {
  ClassificationResult,
  CompressOutput,
  LogEvent,
  LogLevel,
  ManualStage,
  OptimizationGoal,
  OptimizationResult,
  PhaseId,
  PipelinePhase,
  PlannedStage,
  PlanResult,
  PluginConfig,
  RunCallbacks,
  RunOptions,
  StageResult,
  ValidationResult,
} from "./types";

/**
 * Turn a user-defined pipeline into a PlanResult, bypassing the auto-planner.
 * Stages run in exactly the given order with their own per-stage aggressiveness;
 * unknown plugin ids are dropped.
 */
function buildManualPlan(
  manual: ManualStage[],
  goal: OptimizationGoal,
  targetBudget: number,
): PlanResult {
  const stages: PlannedStage[] = [];
  for (const m of manual) {
    const plugin = getPlugin(m.pluginId);
    if (!plugin) continue;
    stages.push({
      pluginId: m.pluginId,
      reason: `${plugin.metadata.name} — manual stage at ${Math.round(
        m.aggressiveness * 100,
      )}% aggressiveness.`,
      aggressiveness: m.aggressiveness,
    });
  }

  const reasoning: string[] = [
    `Manual pipeline — ${stages.length} stage${
      stages.length === 1 ? "" : "s"
    }, run exactly as you arranged them.`,
    `Goal: ${GOAL_LABELS[goal]} — target ≈ ${formatCompact(targetBudget)} tokens.`,
    ...stages.map((s, i) => `${i + 1}. ${s.reason}`),
  ];
  if (stages.length === 0) {
    reasoning.push("No optimizers are enabled — the output will match the input.");
  }

  return { goal, targetBudget, stages, reasoning, mode: "manual" };
}

function initialPhases(): PipelinePhase[] {
  return PHASE_INFO.map((p) => ({ ...p, status: "waiting" as const }));
}

function stageDelay(tokens: number, slow: boolean): number {
  const base = slow ? 520 : 340;
  return Math.round(base + Math.min(tokens / 2200, 1) * 600);
}

function extractEntities(text: string): string[] {
  const matches =
    text.match(/[A-Z][a-zA-Z]{2,}|\b\d+(?:\.\d+)?\b|[A-Z_]{3,}|ERROR|FATAL/g) ?? [];
  return [...new Set(matches)].slice(0, 250);
}

function validate(
  original: string,
  optimized: string,
  stages: StageResult[],
): ValidationResult {
  const origTokens = countTokens(original);
  const optTokens = countTokens(optimized);
  const reduction = origTokens > 0 ? 1 - optTokens / origTokens : 0;
  const avgQuality = stages.length
    ? stages.reduce((a, s) => a + s.qualityScore, 0) / stages.length
    : 1;

  const similarity = clamp(0.99 - reduction * 0.12 - (1 - avgQuality) * 0.5, 0.55, 0.995);
  const retention = clamp(avgQuality * 0.85 + (1 - reduction) * 0.15, 0.5, 0.99);

  const entities = extractEntities(original);
  const present = entities.filter((e) => optimized.includes(e)).length;
  const entityRetention = entities.length
    ? clamp(0.55 + (present / entities.length) * 0.44, 0.55, 0.99)
    : 0.95;

  const confidence = clamp((similarity + retention + avgQuality) / 3, 0.5, 0.99);
  const warnings: string[] = [];
  if (reduction > 0.9)
    warnings.push("Very high compression — verify critical details survived.");
  if (similarity < 0.8)
    warnings.push("Semantic similarity below 80% — consider a higher-quality goal.");

  return {
    semanticSimilarity: similarity,
    informationRetention: retention,
    entityRetention,
    confidence,
    accepted: similarity >= 0.7,
    warnings,
    fallbacksUsed: [],
  };
}

/**
 * Orchestrates the full optimization run: analyze → classify → plan →
 * compress (stage by stage) → validate → assemble. Progress is streamed back
 * through `callbacks` so the UI can animate the live pipeline and activity log.
 */
export async function runOptimization(
  options: RunOptions,
  callbacks: RunCallbacks = {},
): Promise<OptimizationResult> {
  const { input, goal, targetBudget } = options;
  const phases = initialPhases();
  const emitPhases = () => callbacks.onPhases?.(phases.map((p) => ({ ...p })));
  const setPhase = (id: PhaseId, patch: Partial<PipelinePhase>) => {
    const phase = phases.find((p) => p.id === id);
    if (phase) Object.assign(phase, patch);
    emitPhases();
  };
  const log = (level: LogLevel, message: string) =>
    callbacks.onLog?.({ ts: Date.now(), level, message } satisfies LogEvent);

  emitPhases();
  log("info", "Input received");

  // 1. Analysis
  setPhase("analysis", { status: "running" });
  await sleep(380);
  const classification: ClassificationResult = classify(input, options.contentTypeOverride);
  const originalTokens = classification.stats.tokens;
  setPhase("analysis", {
    status: "completed",
    detail: `${formatNumber(originalTokens)} tokens · ${formatNumber(
      classification.stats.lines,
    )} lines`,
  });
  log(
    "info",
    `Analyzed input — ${formatNumber(originalTokens)} tokens, ${formatNumber(
      classification.stats.lines,
    )} lines`,
  );

  // 2. Classification
  setPhase("classification", { status: "running" });
  await sleep(420);
  setPhase("classification", {
    status: "completed",
    detail: `${TYPE_LABELS[classification.primary]} · ${Math.round(
      classification.confidence * 100,
    )}%`,
  });
  log(
    "success",
    `Detected ${TYPE_LABELS[classification.primary]} (${Math.round(
      classification.confidence * 100,
    )}% confidence)`,
  );

  // 3. Planning
  setPhase("planning", { status: "running" });
  await sleep(420);
  const isManual = options.manualPlan !== undefined;
  const plan = isManual
    ? buildManualPlan(options.manualPlan!, goal, targetBudget)
    : planPipeline({
        classification,
        goal,
        targetBudget,
        enabledPluginIds: options.enabledPluginIds,
      });
  const planNames = plan.stages.map(
    (s) => getPlugin(s.pluginId)?.metadata.name ?? s.pluginId,
  );
  setPhase("planning", {
    status: "completed",
    detail: `${plan.stages.length}-stage ${isManual ? "manual " : ""}pipeline`,
  });
  log(
    "info",
    `${isManual ? "Manual pipeline" : "Planned pipeline"}: ${
      planNames.join(" → ") || "no stages"
    }`,
  );

  // 4. Compression
  setPhase("compression", { status: "running" });
  const stages: StageResult[] = [];
  let currentText = input;
  let currentTokens = originalTokens;
  const total = plan.stages.length;

  for (let i = 0; i < plan.stages.length; i++) {
    const planned = plan.stages[i];
    const plugin = getPlugin(planned.pluginId);
    if (!plugin) continue;

    setPhase("compression", {
      detail: `Running ${plugin.metadata.name} (${i + 1}/${total})`,
    });
    log("info", `Running ${plugin.metadata.name}`);

    const slow =
      plugin.metadata.category === "summarization" ||
      plugin.metadata.category === "retrieval";
    await sleep(stageDelay(currentTokens, slow));

    const config: PluginConfig = {
      aggressiveness: planned.aggressiveness ?? defaultAggressiveness(goal),
      similarityThreshold: 0.8,
      enabled: true,
    };

    const start = performance.now();
    let out: CompressOutput;
    try {
      out = plugin.compress({
        text: currentText,
        classification,
        goal,
        targetBudget,
        config,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed: StageResult = {
        pluginId: plugin.metadata.id,
        name: plugin.metadata.name,
        description: plugin.metadata.description,
        status: "failed",
        inputTokens: currentTokens,
        outputTokens: currentTokens,
        inputChars: currentText.length,
        outputChars: currentText.length,
        ratio: 1,
        reductionPct: 0,
        durationMs: Math.round(performance.now() - start),
        qualityScore: 0,
        notes: [message],
        outputText: currentText,
      };
      stages.push(failed);
      callbacks.onStage?.(failed, i, total);
      log("error", `${plugin.metadata.name} failed: ${message}`);
      continue;
    }

    const durationMs = Math.round(performance.now() - start);
    const outputTokens = countTokens(out.text);
    const ratio = currentTokens > 0 ? outputTokens / currentTokens : 1;
    const stage: StageResult = {
      pluginId: plugin.metadata.id,
      name: plugin.metadata.name,
      description: plugin.metadata.description,
      status: "completed",
      inputTokens: currentTokens,
      outputTokens,
      inputChars: currentText.length,
      outputChars: out.text.length,
      ratio,
      reductionPct: 1 - ratio,
      durationMs,
      qualityScore: out.qualityScore,
      notes: out.notes.length ? out.notes : ["No structural change on this input"],
      outputText: out.text,
    };
    stages.push(stage);
    callbacks.onStage?.(stage, i, total);
    log(
      "success",
      `${plugin.metadata.name}: ${formatCompact(currentTokens)} → ${formatCompact(
        outputTokens,
      )} (−${Math.round(stage.reductionPct * 100)}%)`,
    );
    currentText = out.text;
    currentTokens = outputTokens;
  }
  setPhase("compression", {
    status: "completed",
    detail: `${formatCompact(originalTokens)} → ${formatCompact(currentTokens)}`,
  });

  // 5. Validation
  setPhase("validation", { status: "running" });
  await sleep(480);
  const validation = validate(input, currentText, stages);
  setPhase("validation", {
    status: validation.accepted ? "completed" : "failed",
    detail: `${(validation.semanticSimilarity * 100).toFixed(1)}% similar`,
  });
  log(
    validation.accepted ? "success" : "warn",
    `Validation ${validation.accepted ? "passed" : "flagged"} — ${(
      validation.semanticSimilarity * 100
    ).toFixed(1)}% similarity, ${Math.round(
      validation.informationRetention * 100,
    )}% info retained`,
  );
  for (const w of validation.warnings) log("warn", w);

  // 6. Final assembly
  setPhase("assembly", { status: "running" });
  await sleep(280);
  const optimizedTokens = currentTokens;
  const result: OptimizationResult = {
    id: crypto.randomUUID(),
    inputText: input,
    outputText: currentText,
    originalTokens,
    optimizedTokens,
    originalChars: input.length,
    optimizedChars: currentText.length,
    classification,
    plan,
    stages,
    validation,
    totalDurationMs: stages.reduce((a, s) => a + s.durationMs, 0),
    budgetBefore: buildBudgetBefore(classification, originalTokens),
    budgetAfter: buildBudgetAfter(classification, optimizedTokens),
    createdAt: Date.now(),
  };
  setPhase("assembly", { status: "completed", detail: `${formatCompact(optimizedTokens)} tokens` });

  const totalReduction =
    originalTokens > 0 ? Math.round((1 - optimizedTokens / originalTokens) * 100) : 0;
  log(
    "success",
    `Done — ${formatCompact(originalTokens)} → ${formatCompact(
      optimizedTokens,
    )} tokens (${totalReduction}% smaller)`,
  );

  return result;
}
