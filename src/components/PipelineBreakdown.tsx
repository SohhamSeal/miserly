import * as React from "react";
import { ChevronRight, Layers } from "lucide-react";
import {
  TYPE_LABELS,
  classify,
  countTokens,
  getPlugin,
  type ContentType,
  type OptimizationResult,
} from "@/engine";
import { formatCompact } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface SectionInsight {
  startLine: number;
  endLine: number;
  lineCount: number;
  text: string;
  type: ContentType;
  confidence: number;
  tokens: number;
  /** Plugin ids from this run that target this section's type. */
  appliedPluginIds: string[];
}

interface RawBlock {
  text: string;
  startLine: number;
  endLine: number;
}

/** Split into blocks separated by blank line(s); tracks 1-based line numbers. */
function splitBlocks(input: string): RawBlock[] {
  const lines = input.split("\n");
  const blocks: RawBlock[] = [];
  let cur: string[] = [];
  let start = 1;

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (line.trim() === "") {
      if (cur.length > 0) {
        blocks.push({ text: cur.join("\n"), startLine: start, endLine: lineNo - 1 });
        cur = [];
      }
    } else {
      if (cur.length === 0) start = lineNo;
      cur.push(line);
    }
  });
  if (cur.length > 0) {
    blocks.push({ text: cur.join("\n"), startLine: start, endLine: lines.length });
  }
  return blocks;
}

/**
 * Section-by-section view of the input: classify each block, merge adjacent
 * blocks of the same type into one coherent section, then attach the run's
 * optimizers that target that type.
 *
 * Honesty note: optimizers run over the whole document, and most are simulated,
 * so "applied" means "this stage in your run handles this content type" — not a
 * verified per-line diff.
 */
function analyzeSections(input: string, ranPluginIds: string[]): SectionInsight[] {
  const blocks = splitBlocks(input);
  if (blocks.length === 0) return [];

  const classified = blocks.map((b) => {
    let type: ContentType = "mixed";
    let confidence = 0;
    try {
      const c = classify(b.text);
      type = c.primary;
      confidence = c.confidence;
    } catch {
      /* leave as mixed/0 */
    }
    return { ...b, type, confidence };
  });

  // Merge consecutive blocks with the same detected type into one section.
  const merged: Array<RawBlock & { type: ContentType; confidence: number }> = [];
  for (const blk of classified) {
    const last = merged[merged.length - 1];
    if (last && last.type === blk.type) {
      last.endLine = blk.endLine;
      last.text += `\n\n${blk.text}`;
      last.confidence = Math.max(last.confidence, blk.confidence);
    } else {
      merged.push({ ...blk });
    }
  }

  return merged.map((m) => {
    const appliedPluginIds = ranPluginIds.filter((id) => getPlugin(id)?.supports(m.type));
    return {
      startLine: m.startLine,
      endLine: m.endLine,
      lineCount: m.endLine - m.startLine + 1,
      text: m.text,
      type: m.type,
      confidence: m.confidence,
      tokens: countTokens(m.text),
      appliedPluginIds,
    };
  });
}

const PREVIEW_LINES = 10;

function SectionCard({ section, index }: { section: SectionInsight; index: number }) {
  const [showFull, setShowFull] = React.useState(false);
  const lines = section.text.split("\n");
  const shown = showFull ? lines : lines.slice(0, PREVIEW_LINES);
  const lineLabel =
    section.startLine === section.endLine
      ? `L${section.startLine}`
      : `L${section.startLine}–${section.endLine}`;

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
          {index + 1}
        </span>
        <Tip content="Line range in your original input.">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {lineLabel}
          </span>
        </Tip>
        <Badge variant="secondary">{TYPE_LABELS[section.type]}</Badge>
        <Tip content="Classifier confidence for this section.">
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(section.confidence * 100)}%
          </span>
        </Tip>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatCompact(section.tokens)} tok · {section.lineCount}{" "}
          {section.lineCount === 1 ? "line" : "lines"}
        </span>
      </div>

      <div className="mt-2.5">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Applied optimizers
        </div>
        {section.appliedPluginIds.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {section.appliedPluginIds.map((id) => (
              <span
                key={id}
                className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                {getPlugin(id)?.metadata.name ?? id}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] italic text-muted-foreground/60">
            no optimizer in this run targets {TYPE_LABELS[section.type]}
          </span>
        )}
      </div>

      <pre className="mt-2.5 whitespace-pre-wrap break-words rounded bg-background/60 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground/90">
        {shown.join("\n") || "(blank)"}
      </pre>
      {lines.length > PREVIEW_LINES ? (
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="mt-1.5 text-[11px] font-medium text-primary hover:underline"
        >
          {showFull ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      ) : null}
    </div>
  );
}

export function PipelineBreakdown({ result }: { result: OptimizationResult }) {
  const sections = React.useMemo(
    () =>
      analyzeSections(
        result.inputText,
        result.plan.stages.map((s) => s.pluginId),
      ),
    // result.id is a stable per-run key, so this recomputes once per run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.id],
  );

  if (sections.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium transition-colors hover:border-primary/30 hover:bg-accent/50"
        >
          <Layers className="h-4 w-4 text-primary" />
          Section breakdown
          <span className="text-xs font-normal text-muted-foreground">
            · {sections.length} {sections.length === 1 ? "section" : "sections"}
          </span>
          <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
        </button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl md:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Section breakdown
          </SheetTitle>
          <SheetDescription>
            How each part of your input was classified, and which optimizers in this run handle that
            type. Optimizers run over the whole document — this maps them by content type, not as a
            per-line diff.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-5">
          {sections.map((s, i) => (
            <SectionCard key={`${s.startLine}-${i}`} section={s} index={i} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
