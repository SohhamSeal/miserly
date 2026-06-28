import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Info,
  RotateCcw,
  SlidersHorizontal,
  Wand2,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  GOAL_LABELS,
  TYPE_LABELS,
  classify,
  countTokens,
  getPlugin,
  planPipeline,
  projectManualPipeline,
  stageRatio,
  type ContentType,
} from "@/engine";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store/useStudioStore";
import {
  computeSeedStages,
  usePipelineStore,
  type PipelineStageConfig,
} from "@/store/usePipelineStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CONTENT_TYPE_OPTIONS: Array<ContentType | "auto"> = [
  "auto",
  ...(Object.keys(TYPE_LABELS) as ContentType[]),
];

function contentTypeLabel(value: ContentType | "auto"): string {
  return value === "auto" ? "Auto-detect" : TYPE_LABELS[value];
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Wand2;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

interface StageRowProps {
  stage: PipelineStageConfig;
  index: number;
  total: number;
  effectiveType: ContentType;
  isDragOver: boolean;
  onToggle: () => void;
  onAggressiveness: (value: number) => void;
  onMove: (direction: "up" | "down") => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function StageRow({
  stage,
  index,
  total,
  effectiveType,
  isDragOver,
  onToggle,
  onAggressiveness,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: StageRowProps) {
  const plugin = getPlugin(stage.pluginId);
  const [expanded, setExpanded] = React.useState(false);
  const rowRef = React.useRef<HTMLDivElement>(null);
  if (!plugin) return null;

  const { name, category, real, description, capabilities, supportedTypes, homepage } =
    plugin.metadata;
  const compatible = plugin.supports(effectiveType);
  const reductionPct = Math.round((1 - stageRatio(stage.pluginId, stage.aggressiveness)) * 100);

  return (
    <div
      ref={rowRef}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "rounded-lg border bg-secondary/30 p-2.5 transition-[opacity,box-shadow,border-color]",
        isDragOver ? "border-primary ring-2 ring-primary/50" : "border-border",
        !stage.enabled && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            // Firefox needs data set for a drag to start at all.
            e.dataTransfer.setData("text/plain", stage.pluginId);
            // Use the whole row (not the tiny handle) as the drag ghost.
            if (rowRef.current) {
              const r = rowRef.current.getBoundingClientRect();
              e.dataTransfer.setDragImage(rowRef.current, e.clientX - r.left, e.clientY - r.top);
            }
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          className="cursor-grab text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </span>

        <Switch checked={stage.enabled} onCheckedChange={onToggle} aria-label={`Enable ${name}`} />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? "Hide details" : "Show what this optimizer does"}
          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground",
              !expanded && "-rotate-90",
            )}
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{name}</span>
              <Badge variant={real ? "success" : "secondary"}>{real ? "real" : "sim"}</Badge>
              {!compatible ? (
                <Tip content={`This optimizer doesn't target ${TYPE_LABELS[effectiveType]} content — it may do little here.`}>
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                    <AlertTriangle className="h-3 w-3" />≠ {TYPE_LABELS[effectiveType]}
                  </span>
                </Tip>
              ) : null}
            </span>
            <span className="block text-xs text-muted-foreground">{CATEGORY_LABELS[category]}</span>
          </span>
        </button>

        <div className="flex shrink-0 items-center">
          <Tip content="Move earlier">
            <button
              type="button"
              onClick={() => onMove("up")}
              disabled={index === 0}
              aria-label="Move earlier"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </Tip>
          <Tip content="Move later">
            <button
              type="button"
              onClick={() => onMove("down")}
              disabled={index === total - 1}
              aria-label="Move later"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </Tip>
        </div>
      </div>

      {expanded ? (
        <div className="ml-8 mt-2 space-y-2 rounded-md border border-border/60 bg-background/40 px-3 py-2">
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          {capabilities.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {capabilities.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Best for:{" "}
              <span className="text-foreground/80">
                {supportedTypes.map((t) => TYPE_LABELS[t]).join(", ")}
              </span>
            </span>
            {homepage ? (
              <a
                href={homepage}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Homepage ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-3 pl-8">
        <Tip content="How hard this stage pushes. Higher = smaller output, lower fidelity.">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Aggressiveness
          </span>
        </Tip>
        <Slider
          value={stage.aggressiveness}
          onValueChange={onAggressiveness}
          disabled={!stage.enabled}
          aria-label={`${name} aggressiveness`}
          className="flex-1"
        />
        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-foreground">
          {Math.round(stage.aggressiveness * 100)}%
        </span>
        <Tip content="Estimated reduction this stage applies on its own.">
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            ≈ −{reductionPct}%
          </span>
        </Tip>
      </div>
    </div>
  );
}

export function PipelineBuilder() {
  const [open, setOpen] = React.useState(false);
  const dragIndex = React.useRef<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  const input = useStudioStore((s) => s.input);
  const goal = useStudioStore((s) => s.goal);
  const targetBudget = useStudioStore((s) => s.targetBudget);

  const mode = usePipelineStore((s) => s.mode);
  const contentType = usePipelineStore((s) => s.contentType);
  const stages = usePipelineStore((s) => s.stages);
  const setMode = usePipelineStore((s) => s.setMode);
  const setContentType = usePipelineStore((s) => s.setContentType);
  const toggleStage = usePipelineStore((s) => s.toggleStage);
  const setAggressiveness = usePipelineStore((s) => s.setAggressiveness);
  const moveStage = usePipelineStore((s) => s.moveStage);
  const reorder = usePipelineStore((s) => s.reorder);
  const resetToAuto = usePipelineStore((s) => s.resetToAuto);
  const ensureSeeded = usePipelineStore((s) => s.ensureSeeded);

  const enabledCount = stages.filter((s) => s.enabled).length;

  const handleOpenChange = (next: boolean) => {
    if (next) ensureSeeded(input, goal, targetBudget);
    setOpen(next);
  };

  // Classification drives compatibility hints + the automatic-plan preview.
  const classification = React.useMemo(() => {
    if (input.trim() === "") return null;
    try {
      return classify(input, contentType === "auto" ? undefined : contentType);
    } catch {
      return null;
    }
  }, [input, contentType]);

  const effectiveType: ContentType =
    contentType !== "auto" ? contentType : classification?.primary ?? "mixed";

  const autoPlan = React.useMemo(() => {
    if (!classification) return null;
    try {
      return planPipeline({ classification, goal, targetBudget });
    } catch {
      return null;
    }
  }, [classification, goal, targetBudget]);

  const startTokens = React.useMemo(
    () => (input.trim() === "" ? 0 : countTokens(input)),
    [input],
  );

  // The list "Reset to Auto plan" would produce right now. When the current
  // stages already equal it, resetting is a no-op, so we disable the button
  // (otherwise clicking it looks like nothing happens).
  const autoSeed = React.useMemo(
    () => computeSeedStages(input, goal, targetBudget, contentType),
    [input, goal, targetBudget, contentType],
  );
  const atAutoPlan = React.useMemo(() => {
    if (stages.length !== autoSeed.length) return false;
    return stages.every((s, i) => {
      const a = autoSeed[i];
      return (
        a.pluginId === s.pluginId &&
        a.enabled === s.enabled &&
        a.aggressiveness === s.aggressiveness
      );
    });
  }, [stages, autoSeed]);

  const enabledStages = stages.filter((s) => s.enabled);
  const projection = projectManualPipeline(
    enabledStages.map((s) => ({ pluginId: s.pluginId, aggressiveness: s.aggressiveness })),
    startTokens,
  );

  const warnings: Array<{ level: "warn" | "info"; text: string }> = [];
  if (mode === "manual") {
    if (enabledStages.length === 0) {
      warnings.push({
        level: "warn",
        text: "No optimizers are enabled — the output will match the input.",
      });
    }
    const incompatible = enabledStages.filter((s) => {
      const p = getPlugin(s.pluginId);
      return p && !p.supports(effectiveType);
    });
    if (incompatible.length > 0) {
      warnings.push({
        level: "warn",
        text: `${incompatible.length} enabled stage${
          incompatible.length > 1 ? "s don't" : " doesn't"
        } target ${TYPE_LABELS[effectiveType]} — they may do little.`,
      });
    }
    if (startTokens > 0 && projection.reductionPct > 0.9) {
      warnings.push({
        level: "warn",
        text: "Projected reduction is over 90% — verify critical details survive.",
      });
    }
    if (startTokens > 0 && projection.projectedTokens > targetBudget) {
      warnings.push({
        level: "info",
        text: `Projected ${formatCompact(
          projection.projectedTokens,
        )} tokens is still above your ${formatCompact(targetBudget)} budget.`,
      });
    }
  }

  const keptPct =
    startTokens > 0 ? Math.max(0, Math.min(100, (projection.projectedTokens / startTokens) * 100)) : 0;

  return (
    <>
      {mode === "manual" ? (
        <Tip content="Switch back to automatic planning">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setMode("auto")}
            aria-label="Switch back to automatic planning"
            className="h-12 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground"
          >
            <Wand2 className="h-4 w-4" />
            <span className="hidden lg:inline">Auto</span>
          </Button>
        </Tip>
      ) : null}

      <Tip
        content={
          mode === "manual"
            ? `Manual pipeline active — ${enabledCount} stage${
                enabledCount === 1 ? "" : "s"
              }. Click to edit.`
            : "Take manual control — pick, reorder and tune the optimizers."
        }
      >
        <Button
          variant={mode === "manual" ? "default" : "outline"}
          size="lg"
          onClick={() => handleOpenChange(true)}
          className={cn("h-12 shadow-sm", mode === "auto" && "bg-card")}
        >
          <SlidersHorizontal />
          <span className="hidden sm:inline">
            {mode === "manual" ? `Manual · ${enabledCount}` : "Pipeline Builder"}
          </span>
        </Button>
      </Tip>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
          <DialogHeader className="border-b border-border p-5">
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              Pipeline Builder
            </DialogTitle>
            <DialogDescription>
              Auto plans the pipeline for you. Manual runs the exact optimizers you pick, in your
              order, with your per-stage tuning.
            </DialogDescription>
          </DialogHeader>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-0.5">
              <ModeButton
                active={mode === "auto"}
                onClick={() => setMode("auto")}
                icon={Wand2}
                label="Auto"
              />
              <ModeButton
                active={mode === "manual"}
                onClick={() => setMode("manual")}
                icon={SlidersHorizontal}
                label="Manual"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Content type</span>
              <Select
                value={contentType}
                onValueChange={(v) => setContentType(v as ContentType | "auto")}
              >
                <SelectTrigger className="h-8 w-[160px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {contentTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Goal / budget context (changed from the toolbar) */}
          <div className="flex items-center gap-2 px-5 py-2.5 text-xs text-muted-foreground">
            <Tip content="Change the goal and budget from the toolbar.">
              <span className="inline-flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Goal <span className="font-medium text-foreground">{GOAL_LABELS[goal]}</span>
                <span className="text-muted-foreground/50">·</span>
                Budget{" "}
                <span className="font-medium text-foreground">
                  {formatCompact(targetBudget)} tokens
                </span>
              </span>
            </Tip>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            {mode === "auto" ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm text-foreground/90">
                  <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    miserly detects your content and assembles the best pipeline automatically.
                    Switch to <span className="font-medium">Manual</span> to choose and tune the
                    stages yourself.
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Automatic plan{" "}
                    {classification ? (
                      <span className="text-foreground">· {TYPE_LABELS[effectiveType]}</span>
                    ) : null}
                  </div>
                  {autoPlan && autoPlan.stages.length > 0 ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {autoPlan.stages.map((s, i) => (
                          <span key={s.pluginId} className="flex items-center gap-1.5">
                            {i > 0 ? (
                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : null}
                            <Badge variant="secondary">
                              {getPlugin(s.pluginId)?.metadata.name ?? s.pluginId}
                            </Badge>
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {autoPlan.reasoning[autoPlan.reasoning.length - 1]}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {input.trim() === ""
                        ? "Add some context to preview the automatic plan."
                        : "No optimizers matched this content."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Optimizers · {enabledCount}/{stages.length} on
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Drag <GripVertical className="inline h-3 w-3" /> or use ▲▼ to reorder
                  </span>
                </div>
                {stages.map((s, i) => (
                  <StageRow
                    key={s.pluginId}
                    stage={s}
                    index={i}
                    total={stages.length}
                    effectiveType={effectiveType}
                    isDragOver={overIndex === i && dragIndex.current !== null && dragIndex.current !== i}
                    onToggle={() => toggleStage(s.pluginId)}
                    onAggressiveness={(v) => setAggressiveness(s.pluginId, v)}
                    onMove={(d) => moveStage(s.pluginId, d)}
                    onDragStart={() => {
                      dragIndex.current = i;
                    }}
                    onDragOver={() => {
                      if (overIndex !== i) setOverIndex(i);
                    }}
                    onDragEnd={() => {
                      dragIndex.current = null;
                      setOverIndex(null);
                    }}
                    onDrop={() => {
                      if (dragIndex.current !== null && dragIndex.current !== i) {
                        reorder(dragIndex.current, i);
                      }
                      dragIndex.current = null;
                      setOverIndex(null);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border p-5">
            {mode === "manual" ? (
              <div className="mb-3 space-y-2">
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Projected (estimate)</span>
                    {startTokens > 0 ? (
                      <span className="font-medium">
                        {formatCompact(startTokens)} → {formatCompact(projection.projectedTokens)}{" "}
                        tokens
                        <span
                          className={cn(
                            "ml-2",
                            projection.reductionPct > 0 ? "text-success" : "text-muted-foreground",
                          )}
                        >
                          −{Math.round(projection.reductionPct * 100)}%
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Add context to see a projection</span>
                    )}
                  </div>
                  {startTokens > 0 ? (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${keptPct}%` }}
                      />
                    </div>
                  ) : null}
                </div>

                {warnings.map((w, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                      w.level === "warn"
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-primary/30 bg-primary/10 text-primary",
                    )}
                  >
                    {w.level === "warn" ? (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{w.text}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              {mode === "manual" ? (
                <Tip
                  content={
                    atAutoPlan
                      ? "Already matching the automatic plan — nothing to reset."
                      : "Rebuild the list from what miserly would choose automatically."
                  }
                >
                  {/* span wrapper keeps the tooltip working even when the button is disabled */}
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      disabled={atAutoPlan}
                      onClick={() => resetToAuto(input, goal, targetBudget)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset to Auto plan
                    </Button>
                  </span>
                </Tip>
              ) : (
                <span />
              )}
              <Button onClick={() => setOpen(false)}>
                <Check className="h-4 w-4" />
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
