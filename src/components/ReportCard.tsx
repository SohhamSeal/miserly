import { AlertTriangle, Coins } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import { MODELS, compareCost, formatUSD, getModel } from "@/engine";
import {
  formatCompact,
  formatMs,
  formatNumber,
  formatPct,
  formatRatio,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MetricTile, SectionTitle, TypeChip } from "@/components/common";

function qualityRating(score: number): { label: string; cls: string } {
  if (score >= 0.95) return { label: "Excellent", cls: "text-success" };
  if (score >= 0.9) return { label: "Great", cls: "text-success" };
  if (score >= 0.8) return { label: "Good", cls: "text-emerald-300" };
  if (score >= 0.7) return { label: "Fair", cls: "text-warning" };
  return { label: "Risky", cls: "text-destructive" };
}

export function ReportCard() {
  const result = useStudioStore((s) => s.result);
  const modelId = useStudioStore((s) => s.modelId);
  const setModelId = useStudioStore((s) => s.setModelId);

  if (!result) return null;

  const model = getModel(modelId);
  const cost = compareCost(result.originalTokens, result.optimizedTokens, model);
  const ratio = result.originalTokens > 0 ? result.optimizedTokens / result.originalTokens : 1;
  const reductionPct = 1 - ratio;
  const tokensSaved = cost.beforeTokens - cost.afterTokens;
  const latency = reductionPct * 0.85;
  const rating = qualityRating(result.validation.confidence);
  const { classification, validation, plan } = result;

  return (
    <Card>
      <CardHeader>
        <SectionTitle
          icon={<Coins className="h-4 w-4" />}
          hint="A full breakdown of what miserly did and what it saves you. Switch the model to recompute costs instantly."
          right={
            <Tip
              content={
                <span>
                  {model.label}: ${model.inputPerM}/1M in · ${model.outputPerM}/1M out ·{" "}
                  {formatCompact(model.contextWindow)} context
                </span>
              }
            >
              <div className="w-[190px]">
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger aria-label="Pricing model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Tip>
          }
        >
          Optimization report
        </SectionTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Detection summary */}
        <Tip
          content={`Detection reasons: ${classification.reasons.join(", ")}.`}
          side="bottom"
        >
          <div className="flex cursor-default flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Detected</span>
            <TypeChip type={classification.primary} />
            {classification.secondary ? <TypeChip type={classification.secondary} /> : null}
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">{formatPct(classification.confidence)} confidence</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{classification.language}</span>
            <span className="text-muted-foreground">·</span>
            <span className="capitalize text-muted-foreground">
              {classification.complexity} complexity
            </span>
          </div>
        </Tip>

        {/* Core metrics */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <MetricTile
            label="Original"
            value={formatNumber(cost.beforeTokens)}
            sub="tokens"
            hint={`Input size as ${model.label} would count it.`}
          />
          <MetricTile
            label="Optimized"
            value={formatNumber(cost.afterTokens)}
            sub="tokens"
            valueClassName="text-primary"
            hint="Final token count after the full pipeline."
          />
          <MetricTile
            label="Ratio"
            value={formatRatio(ratio)}
            sub="input ÷ output"
            hint="How many times smaller the output is. 10× means one tenth the size."
          />
          <MetricTile
            label="Reduction"
            value={formatPct(reductionPct)}
            valueClassName="text-success"
            hint="Percentage of tokens removed."
          />
          <MetricTile
            label="Tokens saved"
            value={formatNumber(tokensSaved)}
            hint="Original minus optimized tokens."
          />
          <MetricTile
            label="Cost before"
            value={formatUSD(cost.beforeCost)}
            hint={`Input cost at ${model.label} pricing ($${model.inputPerM}/1M tokens).`}
          />
          <MetricTile
            label="Cost after"
            value={formatUSD(cost.afterCost)}
            valueClassName="text-success"
            hint="Input cost of the optimized context at the same pricing."
          />
          <MetricTile
            label="You save"
            value={formatUSD(cost.saved)}
            sub={`${formatPct(cost.savedPct)} cheaper`}
            valueClassName="text-success"
            hint="Savings per call. Multiply by your call volume for the real impact."
          />
          <MetricTile
            label="Latency"
            value={`~${formatPct(latency)}`}
            sub="estimated faster"
            hint="Rough estimate — fewer input tokens generally means lower time-to-first-token."
          />
          <MetricTile
            label="Compute time"
            value={formatMs(result.totalDurationMs)}
            hint="How long the optimization pipeline took to run."
          />
          <MetricTile
            label="Retention"
            value={formatPct(validation.informationRetention)}
            hint="Estimated share of important information preserved."
          />
          <MetricTile
            label="Similarity"
            value={formatPct(validation.semanticSimilarity)}
            hint="Estimated semantic similarity between original and optimized text."
          />
        </div>

        {/* Quality + confidence + pipeline */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <MetricTile
            label="Quality rating"
            value={<span className={rating.cls}>{rating.label}</span>}
            hint="Overall confidence in this optimization."
          />
          <MetricTile
            label="Confidence"
            value={formatPct(validation.confidence)}
            hint="Blended score across similarity, retention and per-stage quality."
          />
          <MetricTile
            label="Validation"
            value={
              <span className={validation.accepted ? "text-success" : "text-warning"}>
                {validation.accepted ? "Accepted" : "Flagged"}
              </span>
            }
            hint="Whether the result passed the similarity threshold."
          />
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Pipeline selected
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {plan.stages.map((stage, i) => (
              <span key={stage.pluginId} className="flex items-center gap-1.5">
                {i > 0 ? <span className="text-muted-foreground">→</span> : null}
                <Tip content={stage.reason}>
                  <Badge variant="secondary" className="cursor-default">
                    {result.stages.find((s) => s.pluginId === stage.pluginId)?.name ??
                      stage.pluginId}
                  </Badge>
                </Tip>
              </span>
            ))}
          </div>
        </div>

        {validation.warnings.length > 0 ? (
          <div className="space-y-1.5">
            {validation.warnings.map((w, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning",
                )}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
