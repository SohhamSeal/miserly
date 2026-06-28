import { TrendingDown } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import { compareCost, formatUSD, getModel } from "@/engine";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
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

  if (!result) return null;

  const model = getModel(modelId);
  const cost = compareCost(result.originalTokens, result.optimizedTokens, model);
  const afterPct = cost.beforeCost > 0 ? (cost.afterCost / cost.beforeCost) * 100 : 0;

  return (
    <CollapsibleCard
      title="Cost comparison"
      hint={`Input-token cost at ${model.label} pricing. Updates instantly when you change the model.`}
      summary={
        <>
          saves <span className="font-medium text-success">{formatUSD(cost.saved)}</span>
        </>
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

        <Tip content="Savings on a single call. Multiply by how often you make this call.">
          <div className="flex cursor-default items-center justify-between rounded-lg border border-success/30 bg-success/10 px-4 py-3">
            <div className="flex items-center gap-2 text-success">
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm font-medium">You save</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums text-success">
                {formatUSD(cost.saved)}
              </div>
              <div className="text-xs text-success/80">{formatPct(cost.savedPct)} cheaper per call</div>
            </div>
          </div>
        </Tip>
    </CollapsibleCard>
  );
}
