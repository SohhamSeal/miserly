import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import { GOAL_LABELS, type OptimizationGoal } from "@/engine";
import {
  clearProxyHistory,
  getProxyConfig,
  getProxyHistory,
  getProxyStats,
  patchProxyConfig,
  probeProxy,
  type ProxyConfig,
  type ProxyHistoryEntry,
  type ProxyStats,
} from "@/lib/proxyClient";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivityMonitor } from "./ActivityMonitor";

const GOALS: OptimizationGoal[] = [
  "balanced",
  "max_compression",
  "highest_quality",
  "lowest_cost",
  "fastest",
];

const POLL_MS = 4000;

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1.5 font-mono text-[11px]">
        {command}
      </code>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function Row({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border/60 py-3.5 last:border-0">
      <div className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function StatusDot({ tone }: { tone: "on" | "bypass" | "off" }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        tone === "on" && "bg-success",
        tone === "bypass" && "bg-warning",
        tone === "off" && "bg-muted-foreground/50",
      )}
    />
  );
}

/** Proxy-not-running view: instructions, not a dead end. */
function OfflineView({ port }: { port: number }) {
  const setProxyPort = useSettingsStore((s) => s.setProxyPort);
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5 rounded-md border border-border bg-secondary/30 p-3 text-sm">
        <StatusDot tone="off" />
        <span className="text-muted-foreground">
          Proxy not running on port {port}. Start it in a terminal, then this panel connects
          automatically.
        </span>
      </div>
      <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
        <p className="mb-2 text-muted-foreground">From the miserly project directory:</p>
        <CopyableCommand command="npm run proxy" />
      </div>
      <Row
        title="Proxy port"
        description="Where this panel looks for the proxy (MISERLY_PORT)."
        control={
          <input
            type="number"
            defaultValue={port}
            min={1}
            max={65535}
            aria-label="Proxy port"
            className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm"
            onBlur={(e) => {
              const v = Number(e.currentTarget.value);
              if (Number.isInteger(v) && v > 0 && v < 65536) setProxyPort(v);
            }}
          />
        }
      />
    </div>
  );
}

function ActivitySummary({
  entries,
  capture,
  onOpen,
}: {
  entries: ProxyHistoryEntry[];
  capture: boolean;
  onOpen: () => void;
}) {
  const recent = entries.slice(0, 3);
  return (
    <div className="mt-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Recent activity</h3>
        <Button variant="outline" size="sm" onClick={onOpen}>
          <Activity className="h-3.5 w-3.5" />
          Open activity monitor
        </Button>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Requests that passed through the proxy this session (memory-only,{" "}
        {capture ? "full content captured" : "metadata only"}).
      </p>
      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          No traffic yet — wire a client below and work normally; requests appear here.
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-card/60 p-1.5">
          {recent.map((e) => {
            const pct = e.before > 0 ? Math.round((1 - e.after / e.before) * 100) : 0;
            return (
              <button
                key={e.id}
                type="button"
                onClick={onOpen}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/40"
              >
                <span className="tabular-nums text-muted-foreground">{timeOf(e.ts)}</span>
                <span className="font-medium">{e.client}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {e.blocks.length === 0
                    ? "untouched"
                    : `~${formatCompact(e.before)} → ~${formatCompact(e.after)} (−${pct}%)`}
                </span>
              </button>
            );
          })}
          {entries.length > recent.length ? (
            <button
              type="button"
              onClick={onOpen}
              className="rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent/40"
            >
              + {entries.length - recent.length} more — open the monitor →
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function OnlineView({
  port,
  config,
  stats,
  entries,
  onPatch,
  onClearHistory,
  onOpenMonitor,
  patchError,
}: {
  port: number;
  config: ProxyConfig;
  stats: ProxyStats | null;
  entries: ProxyHistoryEntry[];
  onPatch: (patch: Parameters<typeof patchProxyConfig>[1]) => void;
  onClearHistory: () => void;
  onOpenMonitor: () => void;
  patchError: string | null;
}) {
  const pct = stats && stats.before > 0 ? Math.round((1 - stats.after / stats.before) * 100) : 0;
  return (
    <div>
      {/* Status + the master toggle */}
      <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-border bg-secondary/30 p-3">
        <div className="flex items-center gap-2.5 text-sm">
          <StatusDot tone={config.enabled ? "on" : "bypass"} />
          <div>
            <div className="flex items-center gap-2 font-medium">
              Running on :{port} — {config.enabled ? "compressing" : "bypassing (passthrough)"}
              {config.captureContent ? (
                <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                  ● capturing content
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              {stats
                ? `session: ${stats.requests} request(s) · ${stats.blocks} block(s) · ~${formatCompact(
                    stats.saved,
                  )} tokens saved${stats.before > 0 ? ` (−${pct}%)` : ""}`
                : "no traffic yet this session"}
            </div>
          </div>
        </div>
        <Tip
          content={
            config.enabled
              ? "Turn off: traffic still flows, nothing is modified."
              : "Turn on: oversized blocks get compressed again."
          }
        >
          <span className="inline-flex">
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => onPatch({ enabled: v })}
              aria-label="Compression on/off"
            />
          </span>
        </Tip>
      </div>

      {patchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{patchError}</span>
        </div>
      ) : null}

      <Row
        title="Goal"
        description="How hard to squeeze the blocks it touches."
        control={
          <div className="w-[200px]">
            <Select
              value={config.goal}
              onValueChange={(v) => onPatch({ goal: v as OptimizationGoal })}
            >
              <SelectTrigger aria-label="Proxy optimization goal">
                <SelectValue />
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
        }
      />
      <Row
        title="Per-block budget"
        description="Target size for each compressed block."
        control={
          <div className="w-[200px]">
            <Select
              value={config.budget === null ? "half" : String(config.budget)}
              onValueChange={(v) => onPatch({ budget: v === "half" ? null : Number(v) })}
            >
              <SelectTrigger aria-label="Per-block budget">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="half">Half of each block</SelectItem>
                {[2000, 4000, 8000, 16000].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {formatCompact(n)} tokens
                  </SelectItem>
                ))}
                {config.budget !== null && ![2000, 4000, 8000, 16000].includes(config.budget) ? (
                  <SelectItem value={String(config.budget)}>
                    {formatCompact(config.budget)} tokens (custom)
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <Row
        title="Minimum block size"
        description="Blocks below this are never touched."
        control={
          <input
            type="number"
            key={config.minTokens}
            defaultValue={config.minTokens}
            min={0}
            step={100}
            aria-label="Minimum block size in tokens"
            className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-right text-sm"
            onBlur={(e) => {
              const v = Number(e.currentTarget.value);
              if (Number.isFinite(v) && v >= 0 && v !== config.minTokens)
                onPatch({ minTokens: Math.round(v) });
            }}
          />
        }
      />
      <Row
        title="Compress system prompts"
        description="Off by default: a compressed system prompt breaks provider prompt-caching and can cost more than it saves."
        control={
          <Switch
            checked={config.compressSystem}
            onCheckedChange={(v) => onPatch({ compressSystem: v })}
            aria-label="Compress system prompts"
          />
        }
      />
      <Row
        title="Capture request content"
        description="Off (default): the activity feed stores metadata only — never your text. On: full before/after text is kept in the proxy's memory (max 200 requests, gone on restart, never written to disk)."
        control={
          <Switch
            checked={config.captureContent}
            onCheckedChange={(v) => onPatch({ captureContent: v })}
            aria-label="Capture request content"
          />
        }
      />
      <Row
        title="Compression marker"
        description="Prepend a small “[miserly: …]” note to compressed blocks so the model knows."
        control={
          <Switch
            checked={config.marker}
            onCheckedChange={(v) => onPatch({ marker: v })}
            aria-label="Compression marker"
          />
        }
      />

      <ActivitySummary entries={entries} capture={config.captureContent} onOpen={onOpenMonitor} />

      {/* Wiring */}
      <div className="mt-5">
        <h3 className="mb-1 text-sm font-semibold">Wire up a client</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Point your agent's base URL at the proxy. Turning compression off above never breaks a
          wired client — traffic just passes through.
        </p>
        <div className="flex flex-col gap-3 text-xs">
          <div>
            <div className="mb-1 font-medium">Claude Code</div>
            <CopyableCommand command={`ANTHROPIC_BASE_URL=http://localhost:${port} claude`} />
          </div>
          <div>
            <div className="mb-1 font-medium">Codex / Aider</div>
            <CopyableCommand command={`OPENAI_BASE_URL=http://localhost:${port}/v1`} />
          </div>
          <div>
            <div className="mb-1 font-medium">Cursor (your own API key only)</div>
            <p className="mb-1.5 text-muted-foreground">
              Settings → Models → “Override OpenAI Base URL” →{" "}
              <span className="font-mono">http://localhost:{port}/v1</span>. Cursor's managed
              models route through Cursor's servers and cannot be redirected.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Settings persist to <span className="font-mono">{config.configPath}</span> and apply
        instantly — no proxy restarts. Token figures are estimates unless the exact tokenizer is
        installed.
      </p>
    </div>
  );
}

export function IntegrationsPanel() {
  const port = useSettingsStore((s) => s.proxyPort);
  const [probed, setProbed] = useState(false);
  const [online, setOnline] = useState(false);
  const [config, setConfig] = useState<ProxyConfig | null>(null);
  const [stats, setStats] = useState<ProxyStats | null>(null);
  const [entries, setEntries] = useState<ProxyHistoryEntry[]>([]);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const health = await probeProxy(port);
    if (!alive.current) return;
    if (health === null) {
      setOnline(false);
      setProbed(true);
      return;
    }
    try {
      const [cfg, st, hist] = await Promise.all([
        getProxyConfig(port),
        getProxyStats(port),
        getProxyHistory(port),
      ]);
      if (!alive.current) return;
      setConfig(cfg);
      setStats(st);
      setEntries(hist.entries);
      setOnline(true);
    } catch {
      if (alive.current) setOnline(false);
    } finally {
      if (alive.current) setProbed(true);
    }
  }, [port]);

  useEffect(() => {
    alive.current = true;
    setProbed(false);
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const onPatch = useCallback(
    (patch: Parameters<typeof patchProxyConfig>[1]) => {
      setPatchError(null);
      // Optimistic update; the poll (or the PUT response) reconciles.
      setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
      patchProxyConfig(port, patch)
        .then((cfg) => alive.current && setConfig(cfg))
        .catch((err) => {
          if (!alive.current) return;
          setPatchError(String(err?.message ?? err));
          void refresh();
        });
    },
    [port, refresh],
  );

  const onClearHistory = useCallback(() => {
    clearProxyHistory(port)
      .then(() => alive.current && setEntries([]))
      .catch(() => void refresh());
  }, [port, refresh]);

  return (
    <div>
      <div className="mb-2">
        <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          The local proxy compresses context in-flight between your coding agent and the model
          provider. This panel is its control room.
        </p>
      </div>
      {!probed ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking for the proxy on :{port}…
        </div>
      ) : online && config ? (
        <OnlineView
          port={port}
          config={config}
          stats={stats}
          entries={entries}
          onPatch={onPatch}
          onClearHistory={onClearHistory}
          onOpenMonitor={() => setMonitorOpen(true)}
          patchError={patchError}
        />
      ) : (
        <OfflineView port={port} />
      )}
      <ActivityMonitor
        open={monitorOpen}
        onOpenChange={setMonitorOpen}
        entries={entries}
        capture={config?.captureContent ?? false}
        sessionSaved={stats?.saved ?? 0}
        onClear={onClearHistory}
        onToggleCapture={(v) => onPatch({ captureContent: v })}
      />
    </div>
  );
}
