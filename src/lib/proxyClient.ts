/**
 * Tiny client for the local miserly proxy's control API (scripts/proxy.mjs).
 *
 * The proxy is a separate Node process; the studio is just a dashboard for it.
 * All calls are same-machine (localhost) with short timeouts so a proxy that
 * isn't running fails fast instead of hanging the Settings panel.
 */
import type { OptimizationGoal } from "@/engine";

export interface ProxyConfig {
  enabled: boolean;
  goal: OptimizationGoal;
  /** Per-block token budget; null = half of each block's own size. */
  budget: number | null;
  minTokens: number;
  compressSystem: boolean;
  marker: boolean;
  /** Activity feed: when true, full before/after text is kept (memory-only). */
  captureContent: boolean;
  upstreams: { anthropic: string; openai: string };
  configPath: string;
}

export interface ProxyStats {
  enabled: boolean;
  requests: number;
  blocks: number;
  before: number;
  after: number;
  saved: number;
}

const TIMEOUT_MS = 1500;

function base(port: number): string {
  return `http://localhost:${port}/miserly`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** null = proxy not reachable (not running / wrong port). */
export async function probeProxy(port: number): Promise<{ enabled: boolean } | null> {
  try {
    return await request<{ enabled: boolean }>(`${base(port)}/health`);
  } catch {
    return null;
  }
}

export function getProxyConfig(port: number): Promise<ProxyConfig> {
  return request<ProxyConfig>(`${base(port)}/config`);
}

export function patchProxyConfig(
  port: number,
  patch: Partial<Omit<ProxyConfig, "configPath" | "upstreams">>,
): Promise<ProxyConfig> {
  return request<ProxyConfig>(`${base(port)}/config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function getProxyStats(port: number): Promise<ProxyStats> {
  return request<ProxyStats>(`${base(port)}/stats`);
}

export interface ProxyHistoryBlock {
  label: string;
  before: number;
  after: number;
  /** Present only when content capture is enabled on the proxy. */
  beforeText?: string;
  afterText?: string;
  truncated?: boolean;
}

export interface ProxyHistoryEntry {
  id: string;
  ts: number;
  api: "anthropic" | "openai";
  client: string;
  model: string;
  blocks: ProxyHistoryBlock[];
  before: number;
  after: number;
}

export function getProxyHistory(
  port: number,
): Promise<{ capture: boolean; entries: ProxyHistoryEntry[] }> {
  return request(`${base(port)}/history`);
}

export function clearProxyHistory(port: number): Promise<{ ok: boolean }> {
  return request(`${base(port)}/history`, { method: "DELETE" });
}
