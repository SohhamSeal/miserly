import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { accent } from "@/lib/accent";
import { TYPE_ACCENT, TYPE_LABELS, type ContentType } from "@/engine";
import { Tip } from "@/components/ui/tooltip";

/** A labelled metric with an optional info tooltip. */
export function MetricTile({
  label,
  value,
  hint,
  sub,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  sub?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        {hint ? (
          <Tip content={hint}>
            <button
              type="button"
              className="text-muted-foreground/70 transition-colors hover:text-foreground"
              aria-label={`About ${label}`}
            >
              <Info className="h-3 w-3" />
            </button>
          </Tip>
        ) : null}
      </div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", valueClassName)}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** A colored content-type chip. */
export function TypeChip({
  type,
  className,
  withDot = true,
}: {
  type: ContentType;
  className?: string;
  withDot?: boolean;
}) {
  const a = accent(TYPE_ACCENT[type]);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        a.soft,
        a.text,
        className,
      )}
    >
      {withDot ? <span className={cn("h-1.5 w-1.5 rounded-full", a.dot)} /> : null}
      {TYPE_LABELS[type]}
    </span>
  );
}

/** A small section heading used above panels. */
export function SectionTitle({
  children,
  hint,
  right,
  icon,
  className,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <h2 className="text-sm font-semibold tracking-tight">{children}</h2>
        {hint ? (
          <Tip content={hint}>
            <button
              type="button"
              className="text-muted-foreground/70 transition-colors hover:text-foreground"
              aria-label="More information"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </Tip>
        ) : null}
      </div>
      {right}
    </div>
  );
}

/** Horizontal multi-segment bar (used by the context-budget visualization). */
export function SegmentBar({
  segments,
  className,
}: {
  segments: Array<{ label: string; tokens: number; barClass: string }>;
  className?: string;
}) {
  const total = segments.reduce((a, s) => a + s.tokens, 0) || 1;
  return (
    <div className={cn("flex h-3 w-full overflow-hidden rounded-full bg-secondary/50", className)}>
      {segments.map((s, i) => (
        <Tip key={i} content={`${s.label}: ${s.tokens.toLocaleString()} tokens`}>
          <div
            className={cn("h-full transition-all", s.barClass)}
            style={{ width: `${(s.tokens / total) * 100}%` }}
          />
        </Tip>
      ))}
    </div>
  );
}
