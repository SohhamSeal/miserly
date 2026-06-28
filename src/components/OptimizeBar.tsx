import { Gauge, Loader2, Sparkles, SlidersHorizontal, Target } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import {
  GOAL_LABELS,
  GOAL_HINTS,
  PLUGINS,
  type OptimizationGoal,
} from "@/engine";
import { formatCompact } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const GOALS: OptimizationGoal[] = [
  "balanced",
  "max_compression",
  "highest_quality",
  "lowest_cost",
  "fastest",
];

const BUDGETS = [2000, 4000, 8000, 16000, 32000, 64000];

function PipelineBuilderDialog() {
  return (
    <Dialog>
      <Tip content="Manually pick, reorder and tune optimizers (next pass)">
        <DialogTrigger asChild>
          <Button variant="outline" size="lg" className="h-12">
            <SlidersHorizontal />
            <span className="hidden sm:inline">Pipeline Builder</span>
          </Button>
        </DialogTrigger>
      </Tip>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Pipeline Builder</DialogTitle>
          <DialogDescription>
            Take manual control: choose a content type, set a token budget, pick an optimization
            goal, then enable, disable, reorder and fine-tune each optimizer. Coming in the next
            pass — for now miserly plans the pipeline for you automatically.
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {PLUGINS.length} optimizers available
          </div>
          <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {PLUGINS.map((p) => (
              <div
                key={p.metadata.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-1.5"
              >
                <span className="text-sm font-medium">{p.metadata.name}</span>
                <Badge variant={p.metadata.real ? "success" : "secondary"}>
                  {p.metadata.real ? "real" : "sim"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OptimizeBar() {
  const status = useStudioStore((s) => s.status);
  const phases = useStudioStore((s) => s.phases);
  const input = useStudioStore((s) => s.input);
  const goal = useStudioStore((s) => s.goal);
  const targetBudget = useStudioStore((s) => s.targetBudget);
  const setGoal = useStudioStore((s) => s.setGoal);
  const setTargetBudget = useStudioStore((s) => s.setTargetBudget);
  const optimize = useStudioStore((s) => s.optimize);

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
            className="h-12 w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-base font-semibold text-white shadow-lg shadow-indigo-900/30 hover:from-indigo-500 hover:to-violet-500 disabled:from-secondary disabled:to-secondary disabled:text-muted-foreground"
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

      <div className="flex items-center gap-2">
        <Tip content={`Optimization goal — ${GOAL_HINTS[goal]}`}>
          <div className="w-[180px]">
            <Select
              value={goal}
              onValueChange={(v) => setGoal(v as OptimizationGoal)}
              disabled={isRunning}
            >
              <SelectTrigger aria-label="Optimization goal">
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
              <SelectTrigger aria-label="Target token budget">
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

        <PipelineBuilderDialog />
      </div>
    </div>
  );
}
