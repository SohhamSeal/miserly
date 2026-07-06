import { assertNever, clamp, sleep } from "@/lib/utils";
import { formatCompact, formatNumber } from "@/lib/format";
import { activeTokenizerKind } from "@/integrations";
import { buildBudgetAfter, buildBudgetBefore } from "./budget";
import { classify } from "./classifier";
import { GOAL_LABELS, PHASE_INFO, TYPE_LABELS } from "./labels";
import { planPipeline } from "./planner";
import { defaultAggressiveness } from "./plugins/_base";
import { getPlugin } from "./registry";
import { countTokens } from "./tokenizer";
import { NOISE_SUBS } from "./transforms";
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

/** Common capitalized words that are not meaningful "entities". */
const ENTITY_STOPWORDS = new Set([
  "The", "This", "That", "These", "Those", "There", "Then", "They", "Their",
  "With", "From", "When", "What", "Where", "Which", "Will", "Would", "Should",
  "And", "But", "For", "Not", "You", "Your", "Are", "Was", "Were",
]);

function extractEntities(text: string): string[] {
  // Every alternative is \b-anchored so we never extract a mid-word fragment
  // ("Phone" out of "iPhone") that would then fail its own word-boundary
  // presence test — a byte-identical output must always score 100%.
  const matches =
    text.match(/\b[A-Z][a-zA-Z]{2,}\b|\b\d+(?:\.\d+)?\b|\b[A-Z_]{3,}\b/g) ?? [];
  // IDs/timestamps the engine deliberately rewrites to placeholders (<uuid>,
  // <ts>, <hash>) are not "lost information" — exempt anything that lives
  // inside a noise span so normalizeNoise doesn't tank its own validation.
  const noiseSpans = NOISE_SUBS.flatMap(([re]) => text.match(re) ?? []).join("\n");
  return [...new Set(matches)]
    .filter((e) => !ENTITY_STOPWORDS.has(e))
    .filter((e) => !noiseSpans.includes(e))
    .slice(0, 250);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/**
 * Real, measured validation — no fabricated scores.
 *  • semanticSimilarity = Jaccard overlap of the two word sets (lexical, honest;
 *    it legitimately drops as compression rises).
 *  • informationRetention = recall: fraction of the ORIGINAL's distinct words
 *    still present in the output.
 *  • entityRetention = fraction of load-bearing tokens (Caps words, numbers,
 *    CONSTANTS, ERROR/FATAL) still present.
 * A stage that changes nothing (e.g. a failed stage) now correctly reports
 * ~100% similarity instead of a made-up 55%.
 */
function validate(original: string, optimized: string): ValidationResult {
  const origTokens = countTokens(original);
  const optTokens = countTokens(optimized);
  const reduction = origTokens > 0 ? 1 - optTokens / origTokens : 0;

  const origWords = wordSet(original);
  const optWords = wordSet(optimized);
  let shared = 0;
  for (const w of origWords) if (optWords.has(w)) shared++;
  const union = origWords.size + optWords.size - shared;
  const similarity = union > 0 ? shared / union : 1;
  const retention = origWords.size > 0 ? shared / origWords.size : 1;

  const entities = extractEntities(original);
  // Word-boundary match, not substring: `includes("42")` would falsely match
  // inside "1042", and "Error" inside "Errors" — inflating the score that gates
  // acceptance and carries 40% of the confidence blend.
  const present = entities.filter((e) =>
    new RegExp(`\\b${escapeRegExp(e)}\\b`).test(optimized),
  ).length;
  const entityRetention = entities.length ? present / entities.length : 1;

  // Weight the meaning-bearing signals (entities, retention) above raw lexical
  // overlap, which drops naturally under heavy compression.
  const confidence = clamp(
    entityRetention * 0.4 + retention * 0.4 + similarity * 0.2,
    0,
    1,
  );

  const warnings: string[] = [];
  if (reduction > 0.9)
    warnings.push("Very high compression — verify critical details survived.");
  if (entityRetention < 0.6)
    warnings.push(
      `Only ${Math.round(
        entityRetention * 100,
      )}% of key entities/numbers were found in the output — check nothing important was dropped.`,
    );
  if (retention < 0.4)
    warnings.push(
      "Under 40% of the original's distinct words remain — this is a heavy rewrite.",
    );

  return {
    semanticSimilarity: similarity,
    informationRetention: retention,
    entityRetention,
    confidence,
    accepted: entityRetention >= 0.6 && retention >= 0.35,
    warnings,
    fallbacksUsed: [],
  };
}

/**
 * Per-goal ceiling for closed-loop budget escalation. "highest_quality" returns
 * its own base (== no escalation): when a user explicitly asked for maximum
 * fidelity we won't silently shred it to hit a number — we warn instead. The
 * cost/size goals may push all the way to maximum.
 */
function escalationCeiling(goal: OptimizationGoal): number {
  switch (goal) {
    case "highest_quality":
      return defaultAggressiveness("highest_quality");
    case "fastest":
      return 0.85;
    case "balanced":
      return 0.9;
    case "lowest_cost":
      return 1;
    case "max_compression":
      return 1;
    default:
      return assertNever(goal);
  }
}

/**
 * Run the planned stages once, headlessly (no naps, no callbacks), and return
 * the measured token count. `aggFloor` raises every stage's aggressiveness to at
 * least that value — this is the single knob the budget search turns. `0` leaves
 * each stage at its own planned/goal default.
 */
function measurePipeline(
  input: string,
  stages: PlannedStage[],
  classification: ClassificationResult,
  goal: OptimizationGoal,
  targetBudget: number,
  aggFloor: number,
): number {
  let text = input;
  for (const planned of stages) {
    const plugin = getPlugin(planned.pluginId);
    if (!plugin) continue;
    const aggressiveness = Math.max(
      planned.aggressiveness ?? defaultAggressiveness(goal),
      aggFloor,
    );
    try {
      text = plugin.compress({
        text,
        classification,
        goal,
        targetBudget,
        config: { aggressiveness, similarityThreshold: 0.8, enabled: true },
      }).text;
    } catch {
      // A failing stage is a no-op here; the animated pass reports the failure.
    }
  }
  return countTokens(text);
}

interface BudgetFit {
  /** Aggressiveness floor to apply to the animated pass (0 = no escalation). */
  floor: number;
  /** Whether the budget is actually reachable at this goal's ceiling. */
  met: boolean;
  /** Measured token count at the chosen floor. */
  projectedTokens: number;
}

/**
 * Closed-loop budget fit. Binary-searches the SMALLEST aggressiveness floor in
 * [base, ceiling] whose measured output fits `targetBudget`, so we compress
 * exactly as much as the budget demands and no more (preserving fidelity). This
 * closes the loop the planner only ever *projected*: it checks the real measured
 * token count, not an estimate.
 *
 * Example: budget 4,000; a balanced plan lands at 6,200 tokens at its 0.55
 * default. The search finds that a 0.78 floor lands at 3,950 while 0.70 still
 * overshoots at 4,300 — so it returns floor ≈ 0.78, and the animated run uses
 * that, ending exactly where the search predicted.
 */
async function fitToBudget(
  input: string,
  plan: PlanResult,
  classification: ClassificationResult,
  goal: OptimizationGoal,
  targetBudget: number,
  signal?: AbortSignal,
): Promise<BudgetFit> {
  const base = defaultAggressiveness(goal);
  const ceiling = escalationCeiling(goal);
  // Each probe runs the full pipeline synchronously; yielding a macrotask
  // between probes keeps the UI responsive on large inputs and gives an
  // aborted run a place to actually stop.
  const breathe = async () => {
    await new Promise((r) => setTimeout(r, 0));
    signal?.throwIfAborted();
  };

  // Already within budget at base, or no headroom to escalate → leave as planned.
  const baseline = measurePipeline(input, plan.stages, classification, goal, targetBudget, 0);
  if (baseline <= targetBudget || ceiling <= base) {
    return { floor: 0, met: baseline <= targetBudget, projectedTokens: baseline };
  }
  await breathe();

  // Even maximum effort can't fit it → report the unreachable floor honestly.
  const maxed = measurePipeline(input, plan.stages, classification, goal, targetBudget, ceiling);
  if (maxed > targetBudget) {
    return { floor: ceiling, met: false, projectedTokens: maxed };
  }
  await breathe();

  let lo = base;
  let hi = ceiling;
  let bestFloor = ceiling;
  let bestTokens = maxed;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    const tokens = measurePipeline(input, plan.stages, classification, goal, targetBudget, mid);
    if (tokens <= targetBudget) {
      bestFloor = mid;
      bestTokens = tokens;
      hi = mid;
    } else {
      lo = mid;
    }
    await breathe();
  }
  return { floor: bestFloor, met: true, projectedTokens: bestTokens };
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
  const { input, goal, targetBudget, signal } = options;
  // Staged delays are pure presentation — the real compute is sub-millisecond.
  // `pace` scales every nap: 1 = full animation, 0 = instant (Animations off or
  // reduced-motion), so the tweak → rerun loop isn't gated on fake latency.
  // `getPace` is consulted live so a "Skip" click mid-run fast-forwards the rest.
  const basePace = Math.max(0, options.pace ?? 1);
  const nap = async (ms: number) => {
    signal?.throwIfAborted();
    const pace = Math.max(0, options.getPace?.() ?? basePace);
    await sleep(Math.round(ms * pace));
    signal?.throwIfAborted();
  };
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
  await nap(380);
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
  await nap(420);
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
  await nap(420);
  const isManual = options.manualPlan !== undefined;
  let plan = isManual
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

  // Closed-loop budget enforcement (auto plans only — a manual pipeline's
  // per-stage aggressiveness is the user's explicit instruction, so we never
  // override it). We search headlessly for the gentlest aggressiveness that
  // fits the budget, then run the ANIMATED pass at that floor, so the streamed
  // per-stage breakdown equals the final result the search predicted.
  let aggFloor = 0;
  if (!isManual && plan.stages.length > 0) {
    let fit = await fitToBudget(input, plan, classification, goal, targetBudget, signal);
    if (!fit.met) {
      // The normal plan can't reach the budget even at this goal's ceiling —
      // before declaring the budget unreachable, try a deeper plan: pushing the
      // SAME stages harder is not the only lever, adding stages is the other.
      // (This also compensates for the planner's rough metadata projection
      // under-provisioning stages.)
      const deeper = planPipeline({
        classification,
        goal,
        targetBudget,
        enabledPluginIds: options.enabledPluginIds,
        exhaustive: true,
      });
      if (deeper.stages.length > plan.stages.length) {
        const deeperFit = await fitToBudget(
          input,
          deeper,
          classification,
          goal,
          targetBudget,
          signal,
        );
        if (deeperFit.projectedTokens < fit.projectedTokens) {
          plan = {
            ...deeper,
            reasoning: [
              ...deeper.reasoning,
              "Added stages beyond the initial plan — the shorter pipeline couldn't reach the budget even at maximum aggressiveness.",
            ],
          };
          fit = deeperFit;
          log("info", "Extended the pipeline to get closer to the token budget.");
        }
      }
    }
    aggFloor = fit.floor;
    if (aggFloor > 0 && fit.met) {
      log(
        "info",
        `Tightened compression to fit the ${formatCompact(targetBudget)}-token budget.`,
      );
    } else if (!fit.met) {
      log(
        "warn",
        `${formatCompact(targetBudget)}-token budget is below this goal's floor (~${formatCompact(
          fit.projectedTokens,
        )}).`,
      );
    }
  }

  // 4. Compression
  setPhase("compression", { status: "running" });
  const stages: StageResult[] = [];
  let currentText = input;
  let currentTokens = originalTokens;
  const total = plan.stages.length;

  for (let i = 0; i < plan.stages.length; i++) {
    signal?.throwIfAborted();
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
    await nap(stageDelay(currentTokens, slow));

    const config: PluginConfig = {
      // Raise each stage to the budget-fit floor when the closed loop escalated
      // (aggFloor > 0); otherwise honor the stage's own planned/goal default.
      aggressiveness: Math.max(planned.aggressiveness ?? defaultAggressiveness(goal), aggFloor),
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
  await nap(480);
  const validation = validate(input, currentText);
  // Honest budget reporting: if the measured output still exceeds the target
  // (beyond a small tolerance), say so plainly instead of quietly missing it.
  if (currentTokens > targetBudget * 1.02) {
    validation.warnings.push(
      isManual
        ? `Output is ${formatCompact(currentTokens)} tokens, above your ${formatCompact(
            targetBudget,
          )}-token budget — raise a stage's aggressiveness or add one.`
        : `Couldn't reach the ${formatCompact(targetBudget)}-token budget; ~${formatCompact(
            currentTokens,
          )} tokens is the floor for this goal. Try Max compression or a larger budget.`,
    );
  }
  setPhase("validation", {
    status: validation.accepted ? "completed" : "failed",
    detail: `${(validation.semanticSimilarity * 100).toFixed(1)}% word overlap`,
  });
  log(
    validation.accepted ? "success" : "warn",
    `Validation ${validation.accepted ? "passed" : "flagged"} — ${(
      validation.semanticSimilarity * 100
    ).toFixed(1)}% word overlap, ${Math.round(
      validation.informationRetention * 100,
    )}% of terms retained`,
  );
  for (const w of validation.warnings) log("warn", w);

  // 6. Final assembly
  setPhase("assembly", { status: "running" });
  await nap(280);
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
    budgetBefore: buildBudgetBefore(input),
    budgetAfter: buildBudgetAfter(currentText),
    tokenizerKind: activeTokenizerKind(),
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
