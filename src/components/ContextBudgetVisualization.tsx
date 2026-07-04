import { useStudioStore } from "@/store/useStudioStore";
import { accent } from "@/lib/accent";
import { formatNumber, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildBudgetAfter } from "@/engine/budget";
import type { BudgetSegment } from "@/engine";
import { Tip } from "@/components/ui/tooltip";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { SegmentBar } from "@/components/common";

function Allocation({
  title,
  segments,
  hint,
}: {
  title: string;
  segments: BudgetSegment[];
  hint: string;
}) {
  const total = segments.reduce((a, s) => a + s.tokens, 0) || 1;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{title}</span>
        <Tip content={hint}>
          <span className="cursor-default font-mono tabular-nums text-muted-foreground">
            {formatNumber(total)} tokens
          </span>
        </Tip>
      </div>
      <SegmentBar
        segments={segments.map((s) => ({
          label: s.label,
          tokens: s.tokens,
          barClass: accent(s.accent).bar,
        }))}
      />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
            <span className={cn("h-2 w-2 rounded-sm", accent(s.accent).bar)} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-mono tabular-nums">{formatPct(s.tokens / total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContextBudgetVisualization() {
  const result = useStudioStore((s) => s.result);
  const editedOutput = useStudioStore((s) => s.editedOutput);
  if (!result) return null;

  // Recompute the "after" split from the edited output when it differs, so the
  // budget card agrees with the report and cost tiles.
  const budgetAfter =
    editedOutput !== null && editedOutput !== result.outputText
      ? buildBudgetAfter(editedOutput)
      : result.budgetAfter;
  const afterTotal = budgetAfter.reduce((a, s) => a + s.tokens, 0);

  return (
    <CollapsibleCard
      title="Context budget"
      hint="Where your context budget goes before and after optimization — so you can see what was preserved."
      summary={
        <>
          <span className="font-medium text-foreground">{formatNumber(afterTotal)}</span> tokens after
        </>
      }
      contentClassName="space-y-5"
    >
      <Allocation
        title="Before"
        segments={result.budgetBefore}
        hint="How the original tokens split across detected content types."
      />
      <Allocation
        title="After"
        segments={budgetAfter}
        hint="What kinds of information survived into the optimized output."
      />
    </CollapsibleCard>
  );
}
