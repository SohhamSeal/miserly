import * as React from "react";
import { ChevronDown, Layers } from "lucide-react";
import {
  TYPE_LABELS,
  classify,
  countTokens,
  getPlugin,
  type ContentType,
  type OptimizationResult,
} from "@/engine";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";

interface SectionInsight {
  startLine: number;
  endLine: number;
  preview: string;
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
    const firstLine = m.text.split("\n").find((l) => l.trim() !== "") ?? "";
    return {
      startLine: m.startLine,
      endLine: m.endLine,
      preview: firstLine.slice(0, 120),
      type: m.type,
      confidence: m.confidence,
      tokens: countTokens(m.text),
      appliedPluginIds,
    };
  });
}

function SectionItem({ section }: { section: SectionInsight }) {
  const lineLabel =
    section.startLine === section.endLine
      ? `L${section.startLine}`
      : `L${section.startLine}–${section.endLine}`;

  return (
    <div className="rounded-md border border-border bg-secondary/20 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Tip content="Line range in your original input.">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {lineLabel}
          </span>
        </Tip>
        <Badge variant="secondary">{TYPE_LABELS[section.type]}</Badge>
        <Tip content="Classifier confidence for this section.">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {Math.round(section.confidence * 100)}%
          </span>
        </Tip>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatCompact(section.tokens)} tok
        </span>
      </div>

      <div className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground/80">
        {section.preview || "(blank)"}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Applied
        </span>
        {section.appliedPluginIds.length > 0 ? (
          section.appliedPluginIds.map((id) => (
            <span
              key={id}
              className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
            >
              {getPlugin(id)?.metadata.name ?? id}
            </span>
          ))
        ) : (
          <span className="text-[10px] italic text-muted-foreground/60">
            no optimizer in this run targets {TYPE_LABELS[section.type]}
          </span>
        )}
      </div>
    </div>
  );
}

export function PipelineBreakdown({ result }: { result: OptimizationResult }) {
  const [open, setOpen] = React.useState(false);

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
    <div className="mt-2 rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent/50"
      >
        <Layers className="h-4 w-4 text-primary" />
        Section breakdown
        <span className="text-xs font-normal text-muted-foreground">
          · {sections.length} {sections.length === 1 ? "section" : "sections"}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-1.5 border-t border-border p-2.5">
          <p className="px-0.5 pb-1 text-[11px] leading-relaxed text-muted-foreground">
            How each part of your input was classified, and which optimizers in this run handle that
            type. (Optimizers run over the whole document; this maps them by content type.)
          </p>
          {sections.map((s, i) => (
            <SectionItem key={`${s.startLine}-${i}`} section={s} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
