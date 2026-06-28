/** Formatting helpers shared across the UI. */

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Compact form: 41,000 → "41K", 7_921_000 → "7.92M". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return `${Math.round(n)}`;
  if (abs < 1_000_000) {
    const v = n / 1000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatPct(frac: number, digits = 0): string {
  return `${(frac * 100).toFixed(digits)}%`;
}

/** Compression ratio expressed as a multiplier, e.g. ratio 0.05 → "20.0×". */
export function formatRatio(ratio: number): string {
  if (ratio <= 0) return "∞";
  return `${(1 / ratio).toFixed(1)}×`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatTimeOfDay(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
