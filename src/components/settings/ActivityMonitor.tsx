import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import type { ProxyHistoryEntry } from "@/lib/proxyClient";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function reductionPct(before: number, after: number): number {
  return before > 0 ? Math.round((1 - after / before) * 100) : 0;
}

const isHistoryBlock = (label: string) => label.includes("(history)");

/** What a request actually compressed — drives the rail label so you can tell
 * "my latest message was compressed" from "only carried-over history was". */
function touchKind(e: ProxyHistoryEntry): "none" | "history" | "current" {
  if (e.blocks.length === 0) return "none";
  return e.blocks.some((b) => !isHistoryBlock(b.label)) ? "current" : "history";
}

type RailItem =
  | { kind: "entry"; e: ProxyHistoryEntry }
  | { kind: "gap"; count: number; key: string };

/** Left rail: one row per request, newest first. Untouched requests can be
 * collapsed into thin timeline markers so the timeline stays honest without
 * eating space. */
function HistoryRail({
  entries,
  selectedId,
  onSelect,
}: {
  entries: ProxyHistoryEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const hideUntouched = useSettingsStore((st) => st.monitorHideUntouched);
  const setHideUntouched = useSettingsStore((st) => st.setMonitorHideUntouched);

  const items: RailItem[] = [];
  for (const e of entries) {
    if (!hideUntouched || e.blocks.length > 0) {
      items.push({ kind: "entry", e });
    } else {
      const last = items[items.length - 1];
      if (last?.kind === "gap") last.count++;
      else items.push({ kind: "gap", count: 1, key: e.id });
    }
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          History
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Switch
            checked={hideUntouched}
            onCheckedChange={setHideUntouched}
            aria-label="Hide untouched requests"
            className="scale-[0.7]"
          />
          Hide untouched
        </label>
      </div>
      {items.map((item) =>
        item.kind === "gap" ? (
          <div
            key={item.key}
            className="select-none px-3 py-1 text-center text-[10px] text-muted-foreground/60"
          >
            — {item.count} untouched —
          </div>
        ) : (
          ((e) => {
        const active = e.id === selectedId;
        const kind = touchKind(e);
        const pct = reductionPct(e.before, e.after);
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onSelect(e.id)}
            className={cn(
              "border-l-2 px-3 py-2.5 text-left transition-colors",
              active
                ? "border-indigo-500 bg-accent/60"
                : "border-transparent hover:bg-accent/30",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium">{e.client}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {timeOf(e.ts)}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {e.model}
              {kind === "current" ? (
                <span className="text-success"> · −{pct}%</span>
              ) : kind === "history" ? (
                <span> · history only · −{pct}%</span>
              ) : (
                <span> · untouched</span>
              )}
            </div>
          </button>
        );
          })(item.e)
        ),
      )}
    </div>
  );
}

/** Right side: the selected request as original | compressed + metadata. */
function Detail({
  entry,
  capture,
  onToggleCapture,
}: {
  entry: ProxyHistoryEntry | null;
  capture: boolean;
  onToggleCapture: (value: boolean) => void;
}) {
  const [blockIdx, setBlockIdx] = useState(0);
  // When the chosen request changes, default to the CURRENT turn's block —
  // history blocks ride along first in API order, but "what did my latest
  // message do" is the question people are asking.
  useEffect(() => {
    const current = entry?.blocks.findIndex((b) => !b.label.includes("(history)")) ?? -1;
    setBlockIdx(current >= 0 ? current : 0);
  }, [entry?.id, entry?.blocks]);

  if (!entry) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        Select a request on the left to inspect it.
      </div>
    );
  }

  if (entry.blocks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
        <div className="text-sm font-medium">Nothing was compressed</div>
        <p className="max-w-sm text-xs text-muted-foreground">
          Every block in this {entry.client} request was under the minimum size, so it passed
          through untouched.
        </p>
      </div>
    );
  }

  const block = entry.blocks[Math.min(blockIdx, entry.blocks.length - 1)];
  const hasText = block.beforeText !== undefined && block.afterText !== undefined;
  const historyOnly = entry.blocks.every((b) => isHistoryBlock(b.label));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {historyOnly ? (
        <div className="border-b border-border bg-secondary/40 px-3.5 py-2 text-[11px] text-muted-foreground">
          Only carried-over conversation history was compressed here — your latest message was
          under the size threshold, so it passed through untouched.
        </div>
      ) : null}
      {/* Block chips — pick which compressed block to inspect */}
      <div className="flex flex-wrap gap-1.5 border-b border-border px-3.5 py-2.5">
        {entry.blocks.map((b, i) => {
          const on = i === blockIdx;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setBlockIdx(i)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                on
                  ? "bg-accent text-accent-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {b.label} · {formatCompact(b.before)}→{formatCompact(b.after)}
            </button>
          );
        })}
      </div>

      {/* Original | Compressed */}
      {hasText ? (
        <div className="grid min-h-0 flex-1 grid-cols-2">
          <div className="flex min-h-0 flex-col border-r border-border">
            <div className="border-b border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Original · {block.before.toLocaleString()} tok
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {block.beforeText}
            </pre>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Compressed · {block.after.toLocaleString()} tok
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre px-3 py-2.5 font-mono text-[11px] leading-relaxed">
              {block.afterText}
            </pre>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-sm text-muted-foreground">
            This request was recorded with <strong>metadata only</strong>.
          </div>
          {/* A little before/after token bar so the pane is still informative */}
          <div className="w-full max-w-xs">
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{block.before.toLocaleString()} tok</span>
              <span className="text-success">
                −{reductionPct(block.before, block.after)}%
              </span>
              <span>{block.after.toLocaleString()} tok</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{
                  width: `${block.before > 0 ? (block.after / block.before) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          {capture ? (
            <p className="max-w-sm text-xs text-muted-foreground">
              Capture is on — but this request was recorded before it was enabled. Send a new
              message from your agent; new requests will show their full text here.
            </p>
          ) : (
            <>
              <Button size="sm" onClick={() => onToggleCapture(true)}>
                Turn on capture
              </Button>
              <p className="max-w-sm text-xs text-muted-foreground">
                Captures the full before/after text of <strong>future</strong> requests — kept in
                the proxy's memory only, never written to disk, gone on restart.
              </p>
            </>
          )}
        </div>
      )}

      {/* Metadata bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-secondary/30 px-3.5 py-2 text-[11px] text-muted-foreground">
        <span>
          <span className="text-muted-foreground/60">block</span> {block.label}
        </span>
        <span>
          <span className="text-muted-foreground/60">tokens</span>{" "}
          {block.before.toLocaleString()} → {block.after.toLocaleString()}
        </span>
        <span className="text-success">−{reductionPct(block.before, block.after)}%</span>
        <span>
          <span className="text-muted-foreground/60">model</span> {entry.model}
        </span>
        <span>
          <span className="text-muted-foreground/60">via</span> {entry.client}
        </span>
        <span>
          <span className="text-muted-foreground/60">at</span> {timeOf(entry.ts)}
        </span>
        {block.truncated ? <span className="text-warning">preview truncated</span> : null}
      </div>
    </div>
  );
}

export function ActivityMonitor({
  open,
  onOpenChange,
  entries,
  capture,
  sessionSaved,
  onClear,
  onToggleCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: ProxyHistoryEntry[];
  capture: boolean;
  sessionSaved: number;
  onClear: () => void;
  onToggleCapture: (value: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobile: once a request is tapped, show the detail over the list.
  const [mobileDetail, setMobileDetail] = useState(false);

  // Default the selection to the newest request; keep it valid as the feed
  // rolls. Prefer a request that actually compressed something.
  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );
  useEffect(() => {
    if (!open) return;
    if (selected) return;
    const firstTouched = entries.find((e) => e.blocks.length > 0) ?? entries[0];
    if (firstTouched) setSelectedId(firstTouched.id);
  }, [open, entries, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="flex h-[min(85vh,720px)] w-[min(94vw,1000px)] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Proxy activity monitor</DialogTitle>
        <DialogDescription className="sr-only">
          Requests that passed through the local proxy this session, with original and compressed
          content side by side.
        </DialogDescription>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="text-base font-semibold tracking-tight">Proxy activity</span>
          <span className="text-xs text-muted-foreground">
            {entries.length} request(s) · ~{formatCompact(sessionSaved)} tokens saved
          </span>
          {capture ? (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
              ● capturing
            </span>
          ) : null}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <Switch
              checked={capture}
              onCheckedChange={onToggleCapture}
              aria-label="Capture request content"
              className="scale-75"
            />
            Capture content
          </label>
          {entries.length > 0 ? (
            <Button variant="ghost" size="sm" className="mr-8" onClick={onClear}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          ) : (
            <span className="mr-8" />
          )}
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
            <div className="text-sm font-medium">No traffic yet this session</div>
            <p className="max-w-sm text-xs text-muted-foreground">
              Wire a coding agent through the proxy and work normally — every request that passes
              through appears here.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop: rail + detail side by side */}
            <div className="hidden min-h-0 flex-1 grid-cols-[200px_1fr] md:grid">
              <div className="flex min-h-0 flex-col border-r border-border bg-secondary/20">
                <HistoryRail
                  entries={entries}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                />
              </div>
              <Detail entry={selected} capture={capture} onToggleCapture={onToggleCapture} />
            </div>

            {/* Mobile: list, then detail slides over */}
            <div className="flex min-h-0 flex-1 flex-col md:hidden">
              {mobileDetail && selected ? (
                <>
                  <button
                    type="button"
                    onClick={() => setMobileDetail(false)}
                    className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    All requests
                  </button>
                  <Detail entry={selected} capture={capture} onToggleCapture={onToggleCapture} />
                </>
              ) : (
                <HistoryRail
                  entries={entries}
                  selectedId={selected?.id ?? null}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setMobileDetail(true);
                  }}
                />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
