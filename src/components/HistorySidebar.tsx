import * as React from "react";
import { History, PanelLeftClose, PanelLeftOpen, Trash2, X } from "lucide-react";
import { TYPE_LABELS } from "@/engine";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import { useHistoryStore, type HistoryEntry } from "@/store/useHistoryStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useStudioStore } from "@/store/useStudioStore";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";

/** Coarse "x ago" label. Re-computed on each render (good enough — no ticking). */
function timeAgo(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function HistoryItem({
  entry,
  active,
  onOpen,
  onDelete,
}: {
  entry: HistoryEntry;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const r = entry.result;
  const typeLabel = TYPE_LABELS[r.classification.primary] ?? r.classification.primary;
  const manual = r.plan.mode === "manual";
  const reductionPct =
    r.originalTokens > 0 ? Math.round((1 - r.optimizedTokens / r.originalTokens) * 100) : 0;

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "w-full rounded-lg border px-2.5 py-2 pr-7 text-left transition-colors",
          active
            ? "border-primary/40 bg-primary/10"
            : "border-transparent hover:border-border hover:bg-secondary/50",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{typeLabel}</span>
          <Badge variant={manual ? "default" : "secondary"}>{manual ? "Manual" : "Auto"}</Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{timeAgo(entry.createdAt)}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="tabular-nums">
            {formatCompact(r.originalTokens)} → {formatCompact(r.optimizedTokens)}
          </span>
          {reductionPct > 0 ? (
            <span className="tabular-nums text-success">−{reductionPct}%</span>
          ) : null}
        </div>
      </button>

      <Tip content="Remove from history">
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove this run from history"
          className="absolute right-1 top-1.5 hidden rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group-hover:block"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </Tip>
    </li>
  );
}

export function HistorySidebar() {
  const open = useSettingsStore((s) => s.historyOpen);
  const setOpen = useSettingsStore((s) => s.setHistoryOpen);

  const entries = useHistoryStore((s) => s.entries);
  const activeId = useHistoryStore((s) => s.activeId);
  const remove = useHistoryStore((s) => s.remove);
  const clear = useHistoryStore((s) => s.clear);

  const loadFromHistory = useStudioStore((s) => s.loadFromHistory);

  const [confirmClear, setConfirmClear] = React.useState(false);

  // Collapsed: a thin always-visible rail (click to expand).
  if (!open) {
    return (
      <aside className="sticky top-0 z-30 flex h-screen w-12 shrink-0 flex-col items-center gap-2 border-r border-border bg-card/70 py-3 backdrop-blur-sm">
        <Tip content="Open run history" side="right">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open run history"
            className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <PanelLeftOpen className="h-5 w-5" />
            {entries.length > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                {entries.length}
              </span>
            ) : null}
          </button>
        </Tip>
        <Tip content="Run history" side="right">
          <span className="grid h-9 w-9 place-items-center text-muted-foreground/40">
            <History className="h-4 w-4" />
          </span>
        </Tip>
      </aside>
    );
  }

  // Expanded: full-height panel. Pushes content on desktop; overlays on mobile.
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside className="sticky top-0 z-40 flex h-screen w-72 shrink-0 flex-col border-r border-border bg-card max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" />
            History
          </div>
          <div className="flex items-center gap-0.5">
            {entries.length > 0 ? (
              <Tip content="Clear all history">
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  aria-label="Clear all history"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tip>
            ) : null}
            <Tip content="Collapse sidebar">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Collapse history sidebar"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </Tip>
          </div>
        </div>

        {confirmClear ? (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Clear all {entries.length} runs?</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded px-2 py-1 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clear();
                  setConfirmClear(false);
                }}
                className="rounded bg-destructive px-2 py-1 font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Clear
              </button>
            </span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-muted-foreground">
                <History className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">No runs yet</p>
              <p className="text-xs text-muted-foreground">
                Optimize some context and your runs will show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {entries.map((e) => (
                <HistoryItem
                  key={e.id}
                  entry={e}
                  active={e.id === activeId}
                  onOpen={() => loadFromHistory(e)}
                  onDelete={() => remove(e.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          Kept for this browser session only — cleared when you close the tab.
        </div>
      </aside>
    </>
  );
}
