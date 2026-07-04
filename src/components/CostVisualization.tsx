import { useState } from "react";
import { AlertTriangle, Repeat, TrendingDown } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import { analyzeCache, compareCost, countTokens, formatUSD, getModel } from "@/engine";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { CollapsibleCard } from "@/components/CollapsibleCard";

function CostRow({
  label,
  amount,
  pct,
  barClass,
}: {
  label: string;
  amount: string;
  pct: number;
  barClass: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold tabular-nums">{amount}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary/60">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barClass)}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

export function CostVisualization() {
  const result = useStudioStore((s) => s.result);
  const modelId = useStudioStore((s) => s.modelId);
  const editedOutput = useStudioStore((s) => s.editedOutput);
  // Local, exploratory toggle: is this a stable prompt the user reuses? It only
  // changes the cost narrative, never the run — so local state is fine.
  const [reused, setReused] = useState(false);

  if (!result) return null;

  // Recompute from the edited output when the user changed it, so the cost card
  // never disagrees with the token counts shown in the output panel / report.
  const optimizedTokens =
    editedOutput !== null && editedOutput !== result.outputText
      ? countTokens(editedOutput)
      : result.optimizedTokens;
  const model = getModel(modelId);
  const cost = compareCost(result.originalTokens, optimizedTokens, model);
  const afterPct = cost.beforeCost > 0 ? (cost.afterCost / cost.beforeCost) * 100 : 0;
  const increased = cost.saved < 0;
  const magnitude = formatUSD(Math.abs(cost.saved));
  const cache = analyzeCache(result.originalTokens, optimizedTokens, model);

  return (
    <CollapsibleCard
      title="Cost comparison"
      hint={`Input-token cost at ${model.label} pricing. Updates instantly when you change the model.`}
      summary={
        increased ? (
          <>
            costs <span className="font-medium text-destructive">{magnitude}</span> more
          </>
        ) : (
          <>
            saves <span className="font-medium text-success">{magnitude}</span>
          </>
        )
      }
      contentClassName="space-y-4"
    >
      <div className="space-y-3">
          <CostRow
            label="Original cost"
            amount={formatUSD(cost.beforeCost)}
            pct={100}
            barClass="bg-gradient-to-r from-rose-500 to-orange-400"
          />
          <CostRow
            label="Optimized cost"
            amount={formatUSD(cost.afterCost)}
            pct={afterPct}
            barClass="bg-gradient-to-r from-emerald-500 to-teal-400"
          />
        </div>

        <Tip
          content={
            increased
              ? "This pipeline made the context larger, so it costs more — not less."
              : "Savings on a single call. Multiply by how often you make this call."
          }
        >
          <div
            className={cn(
              "flex cursor-default items-center justify-between rounded-lg border px-4 py-3",
              increased
                ? "border-destructive/30 bg-destructive/10"
                : "border-success/30 bg-success/10",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2",
                increased ? "text-destructive" : "text-success",
              )}
            >
              <TrendingDown className={cn("h-4 w-4", increased && "rotate-180")} />
              <span className="text-sm font-medium">{increased ? "Costs more" : "You save"}</span>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  increased ? "text-destructive" : "text-success",
                )}
              >
                {increased ? "+" : ""}
                {magnitude}
              </div>
              <div
                className={cn("text-xs", increased ? "text-destructive/80" : "text-success/80")}
              >
                {formatPct(Math.abs(cost.savedPct))} {increased ? "more expensive" : "cheaper"} per
                call
              </div>
            </div>
          </div>
        </Tip>

        <div className="rounded-lg border border-border bg-secondary/30 p-3">
          <Tip content="Providers cache byte-identical prompt prefixes and bill reuses at a fraction of the input price. This changes whether compressing is even the right move.">
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Repeat className="h-4 w-4 text-muted-foreground" />
                Reused prompt (KV cache)
              </span>
              <Switch checked={reused} onCheckedChange={setReused} aria-label="Prompt is reused" />
            </label>
          </Tip>

          {reused ? (
            cache.supported ? (
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-muted-foreground">
                  {model.label} bills a cache hit at{" "}
                  <span className="font-medium text-foreground">
                    {formatUSD(cache.cacheReadPerM)}/1M
                  </span>{" "}
                  — about {formatPct(cache.cacheFraction)} of input.
                </p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Send compressed every call</span>
                    <span className="font-mono tabular-nums">{formatUSD(cache.perCallCompressed)}</span>
                  </div>
                  <div className="flex items-center justify-between text-success">
                    <span>Compress once, then cache (per reuse)</span>
                    <span className="font-mono tabular-nums">{formatUSD(cache.cacheReadCompressed)}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Compress the prompt <span className="font-medium">once</span> and cache the
                    result. Re-compressing per request changes the bytes, busts the cache, and pays
                    full input price again.
                    {cache.breakEvenReuse !== null ? (
                      <>
                        {" "}
                        Even without compressing, past ~
                        <span className="font-medium">{cache.breakEvenReuse}</span> reuses caching
                        the original alone beats compressing every call.
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                We don&apos;t have standard prompt-cache pricing for {model.label}, so compression is
                your main lever here.
              </p>
            )
          ) : null}
        </div>
    </CollapsibleCard>
  );
}
