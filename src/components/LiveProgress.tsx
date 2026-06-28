import { AnimatePresence, motion } from "framer-motion";
import { Check, Circle, Loader2, X } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import { useAnimationsEnabled } from "@/store/useSettingsStore";
import { formatCompact, formatMs } from "@/lib/format";
import type { PhaseStatus, PipelinePhase, StageResult } from "@/engine";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionTitle } from "@/components/common";
import { PipelineBreakdown } from "@/components/PipelineBreakdown";

function StatusIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case "completed":
      return (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-success/15 text-success">
          <Check className="h-3.5 w-3.5" />
        </span>
      );
    case "running":
      return (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
      );
    case "failed":
      return (
        <span className="grid h-6 w-6 place-items-center rounded-full bg-destructive/15 text-destructive">
          <X className="h-3.5 w-3.5" />
        </span>
      );
    case "waiting":
      return (
        <span className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground/40">
          <Circle className="h-3 w-3" />
        </span>
      );
  }
}

function StageRow({ stage, animate }: { stage: StageResult; animate: boolean }) {
  const failed = stage.status === "failed";
  const className =
    "flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-2.5 py-1.5";
  const inner = (
    <>
      <span className="text-sm font-medium">{stage.name}</span>
      <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
        <span>
          {formatCompact(stage.inputTokens)} → {formatCompact(stage.outputTokens)}
        </span>
        {!failed ? (
          <span className="rounded bg-success/15 px-1.5 py-0.5 text-success">
            −{Math.round(stage.reductionPct * 100)}%
          </span>
        ) : (
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">failed</span>
        )}
      </div>
    </>
  );

  if (!animate) return <div className={className}>{inner}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={className}
    >
      {inner}
    </motion.div>
  );
}

function phaseLabelClass(status: PhaseStatus): string {
  switch (status) {
    case "completed":
      return "text-foreground";
    case "running":
      return "text-foreground font-medium";
    case "failed":
      return "text-destructive font-medium";
    case "waiting":
      return "text-muted-foreground";
  }
}

export function LiveProgress() {
  const phases = useStudioStore((s) => s.phases);
  const liveStages = useStudioStore((s) => s.liveStages);
  const status = useStudioStore((s) => s.status);
  const result = useStudioStore((s) => s.result);
  const animate = useAnimationsEnabled();

  if (status === "idle") return null;

  const completed = phases.filter((p) => p.status === "completed").length;

  return (
    <Card>
      <CardHeader>
        <SectionTitle
          hint="Each stage runs in order. Watch tokens fall as the pipeline executes."
          right={
            <span className="font-mono text-xs text-muted-foreground">
              {completed}/{phases.length}
            </span>
          }
        >
          Live pipeline
        </SectionTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col">
          {phases.map((phase: PipelinePhase, i) => (
            <li key={phase.id}>
              <div className="flex items-stretch gap-3">
                <div className="flex flex-col items-center">
                  <StatusIcon status={phase.status} />
                  {i < phases.length - 1 ? (
                    <div
                      className={cn(
                        "my-1 w-px flex-1",
                        phase.status === "completed" ? "bg-success/40" : "bg-border",
                      )}
                    />
                  ) : null}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm", phaseLabelClass(phase.status))}>
                      {phase.label}
                    </span>
                    {phase.detail ? (
                      <span className="font-mono text-xs text-muted-foreground">{phase.detail}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{phase.description}</div>

                  {phase.id === "compression" && liveStages.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {animate ? (
                        <AnimatePresence initial={false}>
                          {liveStages.map((stage, idx) => (
                            <StageRow key={`${stage.pluginId}-${idx}`} stage={stage} animate />
                          ))}
                        </AnimatePresence>
                      ) : (
                        liveStages.map((stage, idx) => (
                          <StageRow key={`${stage.pluginId}-${idx}`} stage={stage} animate={false} />
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {status === "done" ? (
          <div className="mt-1 flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" />
            Pipeline complete in{" "}
            {formatMs(liveStages.reduce((a, s) => a + s.durationMs, 0))} of compute.
          </div>
        ) : null}

        {status === "done" && result ? <PipelineBreakdown result={result} /> : null}
      </CardContent>
    </Card>
  );
}
