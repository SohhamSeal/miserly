import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import type { ProxyHistoryEntry, ProxySkippedBlock } from "@/lib/proxyClient";
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

const SKIP_REASON: Record<ProxySkippedBlock["reason"], string> = {
  "below-threshold": "below the size minimum",
  "instruction-block": "agent instruction block — never compressed",
  "no-gain": "engine couldn't save 3%, original kept",
};

type RowKind = "current" | "history" | "skipped" | "bypassed" | "passthrough" | "untouched";

/** What a request did — drives the rail label so each row explains itself. */
function rowKind(e: ProxyHistoryEntry): RowKind {
  if (e.bypassed) return "bypassed";
  if (e.endpoint) return "passthrough";
  if (e.blocks.length > 0) {
    return e.blocks.some((b) => !isHistoryBlock(b.label)) ? "current" : "history";
  }
  if (e.skipped && e.skipped.length > 0) return "skipped";
  return "untouched";
}

const failedStatus = (e: ProxyHistoryEntry) =>
  e.status === "failed" || e.status === "cancelled" || (typeof e.status === "number" && e.status >= 400);

type RailItem =
  | { kind: "entry"; e: ProxyHistoryEntry }
  | { kind: "gap"; counts: Record<string, number>; key: string };

/** "2 untouched · 1 bypassed" — a gap marker that says what it's hiding. */
function gapLabel(counts: Record<string, number>): string {
  const names: Record<string, string> = {
    untouched: "untouched",
    bypassed: "bypassed",
    passthrough: "passed through",
  };
  return Object.entries(counts)
    .map(([k, n]) => `${n} ${names[k] ?? k}`)
    .join(" · ");
}

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
    // Anything that compressed nothing collapses — the per-block reasons live
    // in the detail pane, not the timeline. Failed requests stay visible.
    const kind = rowKind(e);
    const collapsible = e.blocks.length === 0 && !failedStatus(e);
    if (!hideUntouched || !collapsible) {
      items.push({ kind: "entry", e });
    } else {
      // "skipped" reads as "untouched" in the marker; the distinction only
      // matters once you're looking at the individual request.
      const bucket = kind === "bypassed" || kind === "passthrough" ? kind : "untouched";
      const last = items[items.length - 1];
      if (last?.kind === "gap") last.counts[bucket] = (last.counts[bucket] ?? 0) + 1;
      else items.push({ kind: "gap", counts: { [bucket]: 1 }, key: e.id });
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
            title="Requests that compressed nothing. Turn off “Hide untouched” to inspect them — each one records why it was left alone."
            className="cursor-help select-none px-3 py-1 text-center text-[10px] text-muted-foreground/60"
          >
            — {gapLabel(item.counts)} —
          </div>
        ) : (
          ((e) => {
        const active = e.id === selectedId;
        const kind = rowKind(e);
        const pct = reductionPct(e.before, e.after);
        const failed = failedStatus(e);
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
            {/* Model truncates; the outcome label on the right never does. */}
            <div className="mt-0.5 flex items-baseline gap-1 text-[11px] text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{e.model}</span>
              <span className="shrink-0">
                {kind === "current" ? (
                  <span className="text-success">−{pct}%</span>
                ) : kind === "history" ? (
                  <span>history only · −{pct}%</span>
                ) : kind === "skipped" ? (
                  <span>nothing shrunk</span>
                ) : kind === "bypassed" ? (
                  <span className="text-warning">bypassed</span>
                ) : kind === "passthrough" ? (
                  <span>passed through</span>
                ) : (
                  <span>untouched</span>
                )}
                {failed ? <span className="text-destructive"> · {e.status}</span> : null}
              </span>
            </div>
          </button>
        );
          })(item.e)
        ),
      )}
    </div>
  );
}

function FailedBanner({ entry }: { entry: ProxyHistoryEntry }) {
  const msg =
    entry.status === "failed"
      ? "The provider couldn't be reached (network error). Usually transient — the client retries."
      : entry.status === "cancelled"
        ? "The request was cancelled before the provider replied (client timed out or you stopped it)."
        : `The provider rejected this request (HTTP ${entry.status}). miserly forwarded it unchanged — this is between your client and the provider, not a compression problem.`;
  return (
    <div className="border-b border-destructive/40 bg-destructive/10 px-3.5 py-2 text-[11px] text-destructive">
      {msg}
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

  // States with no compressed block to show — each explains itself specifically.
  if (entry.blocks.length === 0) {
    let headline = "Nothing was compressed";
    let body: ReactNode = null;
    if (entry.bypassed) {
      headline = "Compression was off";
      body = (
        <>Compression was bypassed when this {entry.client} request passed through — nothing was
        inspected or modified. Flip the switch above to resume compressing.</>
      );
    } else if (entry.endpoint) {
      headline = "Passed through — not a chat request";
      body = (
        <>This was a <code>{entry.endpoint}</code> request. miserly only compresses chat
        requests (<code>/v1/messages</code>, <code>/v1/chat/completions</code>); other endpoints
        pass through untouched.</>
      );
    } else if (entry.skipped && entry.skipped.length > 0) {
      headline = "Nothing was compressed — here's why";
      body = (
        <ul className="mt-1 space-y-1 text-left">
          {entry.skipped.map((sk, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{sk.label}</span> · ~
              {formatCompact(sk.tokens)} tok — {SKIP_REASON[sk.reason]}
            </li>
          ))}
        </ul>
      );
    } else {
      body = (
        <>Every block was under the ~{formatCompact(entry.minTokens ?? 1500)}-token minimum, so
        this {entry.client} request passed through untouched.</>
      );
    }
    return (
      <div className="flex flex-1 flex-col">
        {entry.status && failedStatus(entry) ? <FailedBanner entry={entry} /> : null}
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <div className="text-sm font-medium">{headline}</div>
          <div className="max-w-sm text-xs text-muted-foreground">{body}</div>
        </div>
      </div>
    );
  }

  const block = entry.blocks[Math.min(blockIdx, entry.blocks.length - 1)];
  const hasText = block.beforeText !== undefined && block.afterText !== undefined;
  const historyOnly = entry.blocks.every((b) => isHistoryBlock(b.label));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {entry.status && failedStatus(entry) ? <FailedBanner entry={entry} /> : null}
      {historyOnly ? (
        <div className="border-b border-border bg-secondary/40 px-3.5 py-2 text-[11px] text-muted-foreground">
          Only carried-over conversation history was compressed here — your latest message was
          under the size threshold, so it passed through untouched.
        </div>
      ) : null}
      {/* Block chips — compressed blocks (clickable) + skipped blocks (muted) */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3.5 py-2.5">
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
        {(entry.skipped ?? []).map((sk, i) => (
          <span
            key={"sk" + i}
            title={SKIP_REASON[sk.reason]}
            className="cursor-help rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground/70"
          >
            {sk.label} · left alone
          </span>
        ))}
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
  online,
  onClear,
  onToggleCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: ProxyHistoryEntry[];
  capture: boolean;
  sessionSaved: number;
  online: boolean;
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
            <Button variant="ghost" size="sm" className="mr-8" onClick={onClear} disabled={!online}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          ) : (
            <span className="mr-8" />
          )}
        </div>

        {!online ? (
          <div className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-[11px] text-warning">
            Proxy unreachable — showing the last snapshot. History is memory-only, so it clears
            when the proxy restarts.
          </div>
        ) : null}

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
