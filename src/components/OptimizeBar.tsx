import { FastForward, Gauge, Loader2, Sparkles, Target, X } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import { GOAL_LABELS, GOAL_HINTS, type OptimizationGoal } from "@/engine";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PipelineBuilder } from "@/components/PipelineBuilder";

const GOALS: OptimizationGoal[] = [
  "balanced",
  "max_compression",
  "highest_quality",
  "lowest_cost",
  "fastest",
];

const BUDGETS = [2000, 4000, 8000, 16000, 32000, 64000];

export function OptimizeBar() {
  const status = useStudioStore((s) => s.status);
  const phases = useStudioStore((s) => s.phases);
  const input = useStudioStore((s) => s.input);
  const goal = useStudioStore((s) => s.goal);
  const targetBudget = useStudioStore((s) => s.targetBudget);
  const setGoal = useStudioStore((s) => s.setGoal);
  const setTargetBudget = useStudioStore((s) => s.setTargetBudget);
  const optimize = useStudioStore((s) => s.optimize);
  const cancel = useStudioStore((s) => s.cancel);
  const skipAnimation = useStudioStore((s) => s.skipAnimation);

  const isRunning = status === "running";
  const isEmpty = input.trim() === "";
  const runningPhase = phases.find((p) => p.status === "running");

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <Tip
        content={
          isEmpty
            ? "Add some context first"
            : "Detect content, plan a pipeline, compress and validate — runs locally in a few seconds."
        }
      >
        <span className="flex-1">
          <Button
            size="lg"
            onClick={() => void optimize()}
            disabled={isRunning || isEmpty}
            className={cn(
              "h-12 w-full text-base font-semibold shadow-lg transition-colors disabled:opacity-100",
              isEmpty && !isRunning
                ? // Empty state: keep the CTA clearly visible (bordered, muted)
                  // rather than blending into the page background — that's exactly
                  // when a first-time user needs to spot the endpoint.
                  "border border-border bg-secondary text-muted-foreground shadow-none"
                : "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-indigo-900/30 hover:from-indigo-500 hover:to-violet-500",
            )}
          >
            {isRunning ? (
              <>
                <Loader2 className="animate-spin" />
                <span>
                  Optimizing…
                  {runningPhase ? (
                    <span className="ml-1 font-normal opacity-80">{runningPhase.label}</span>
                  ) : null}
                </span>
              </>
            ) : (
              <>
                <Sparkles />
                Optimize context
              </>
            )}
          </Button>
        </span>
      </Tip>

      <div className="flex flex-wrap items-center gap-2">
        {isRunning ? (
          <>
            <Tip content="Stop this run and keep the previous result.">
              <Button variant="outline" size="lg" className="h-12" onClick={() => cancel()}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </Tip>
            <Tip content="Skip the animation and jump to the result.">
              <Button
                variant="outline"
                size="lg"
                className="h-12"
                onClick={() => skipAnimation()}
              >
                <FastForward className="h-4 w-4" />
                Skip
              </Button>
            </Tip>
          </>
        ) : null}
        <Tip content={`Optimization goal — ${GOAL_HINTS[goal]}`}>
          <div className="w-[180px]">
            <Select
              value={goal}
              onValueChange={(v) => setGoal(v as OptimizationGoal)}
              disabled={isRunning}
            >
              <SelectTrigger
                aria-label="Optimization goal"
                className="h-12 bg-card shadow-sm hover:bg-accent"
              >
                <span className="flex items-center gap-2 truncate">
                  <Gauge className="h-4 w-4 shrink-0 opacity-70" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {GOALS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GOAL_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Tip>

        <Tip content="Target context budget — miserly stops compressing once it fits.">
          <div className="w-[130px]">
            <Select
              value={String(targetBudget)}
              onValueChange={(v) => setTargetBudget(Number(v))}
              disabled={isRunning}
            >
              <SelectTrigger
                aria-label="Target token budget"
                className="h-12 bg-card shadow-sm hover:bg-accent"
              >
                <span className="flex items-center gap-2 truncate">
                  <Target className="h-4 w-4 shrink-0 opacity-70" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {BUDGETS.map((b) => (
                  <SelectItem key={b} value={String(b)}>
                    {formatCompact(b)} tokens
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Tip>

        <PipelineBuilder />
      </div>
    </div>
  );
}
