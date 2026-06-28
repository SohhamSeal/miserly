/**
 * Real, coherent text transforms.
 *
 * Every optimizer in miserly is built from these. They are deterministic and
 * actually shrink the text, so the original→optimized token counts and costs
 * shown in the UI are TRUE measurements, not fabricated numbers. The
 * "algorithm" of each optimizer is which transforms it composes and how hard.
 */

export interface TransformResult {
  text: string;
  /** Human-readable note about what happened, for the activity log / stage card. */
  note?: string;
}

/** Trim trailing whitespace, collapse internal runs of spaces, squeeze blank lines. */
export function collapseWhitespace(text: string): TransformResult {
  const before = text.length;
  const lines = text.split("\n").map((line) => {
    const lead = line.match(/^[\t ]*/)?.[0] ?? "";
    const rest = line
      .slice(lead.length)
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+$/, "");
    return lead + rest;
  });
  const out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const saved = before - out.length;
  return {
    text: out,
    note: saved > 0 ? `Collapsed whitespace (−${saved.toLocaleString()} chars)` : undefined,
  };
}

/** Collapse consecutive identical lines into one annotated line. */
export function dedupeConsecutiveLines(text: string): TransformResult {
  const lines = text.split("\n");
  const out: string[] = [];
  let collapsed = 0;
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    let run = 1;
    while (i + run < lines.length && lines[i + run] === cur) run++;
    if (run > 1 && cur.trim() !== "") {
      out.push(`${cur}  ⟲ ×${run}`);
      collapsed += run - 1;
    } else {
      for (let k = 0; k < run; k++) out.push(cur);
    }
    i += run;
  }
  return {
    text: out.join("\n"),
    note: collapsed > 0 ? `Collapsed ${collapsed.toLocaleString()} repeated lines` : undefined,
  };
}

/** Deduplicate identical lines anywhere in the document (keep first, annotate count). */
export function dedupeGlobalLines(text: string): TransformResult {
  const lines = text.split("\n");
  const seenAt = new Map<string, number>();
  const out: string[] = [];
  const counts = new Map<number, number>();
  let removed = 0;
  for (const line of lines) {
    const key = line.trim();
    if (key === "") {
      out.push(line);
      continue;
    }
    if (seenAt.has(key)) {
      const idx = seenAt.get(key)!;
      counts.set(idx, (counts.get(idx) ?? 1) + 1);
      removed++;
    } else {
      seenAt.set(key, out.length);
      out.push(line);
    }
  }
  counts.forEach((c, idx) => {
    out[idx] = `${out[idx]}  ⟲ ×${c}`;
  });
  return {
    text: out.join("\n"),
    note: removed > 0 ? `Deduplicated ${removed.toLocaleString()} repeated lines globally` : undefined,
  };
}

const FRAME_RE = /^\s*(at\s+\S|File\s+".*",\s*line\s+\d+|\.{3}\s|Caused by:|\tat\s)/;

/** Keep the top frames of long stack traces, omit the middle. */
export function truncateStackTraces(text: string, keep = 5): TransformResult {
  const lines = text.split("\n");
  const out: string[] = [];
  let omitted = 0;
  let i = 0;
  while (i < lines.length) {
    if (FRAME_RE.test(lines[i])) {
      let j = i;
      while (j < lines.length && FRAME_RE.test(lines[j])) j++;
      const frames = lines.slice(i, j);
      if (frames.length > keep + 1) {
        out.push(...frames.slice(0, keep));
        out.push(`    … ${frames.length - keep - 1} stack frames omitted …`);
        out.push(frames[frames.length - 1]);
        omitted += frames.length - keep - 1;
      } else {
        out.push(...frames);
      }
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return {
    text: out.join("\n"),
    note: omitted > 0 ? `Truncated stack traces (−${omitted} frames)` : undefined,
  };
}

/** Minify pretty-printed / structured JSON blocks and lines. */
export function minifyJsonBlocks(text: string): TransformResult {
  let changed = 0;
  const tryMin = (s: string): string | null => {
    const t = s.trim();
    const looksJson =
      (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
    if (!looksJson) return null;
    try {
      const min = JSON.stringify(JSON.parse(t));
      return min.length < s.length ? min : null;
    } catch {
      return null;
    }
  };

  const blocks = text.split(/\n\s*\n/).map((block) => {
    const min = tryMin(block);
    if (min !== null) {
      changed++;
      return min;
    }
    return block;
  });

  const out = blocks
    .join("\n\n")
    .split("\n")
    .map((line) => {
      if (line.trim().length > 40) {
        const min = tryMin(line);
        if (min !== null) {
          changed++;
          return min;
        }
      }
      return line;
    })
    .join("\n");

  return {
    text: out,
    note: changed > 0 ? `Minified ${changed} JSON block(s)` : undefined,
  };
}

/** Best-effort comment removal for code (line, block, and #-style comments). */
export function stripComments(text: string): TransformResult {
  const before = text.length;
  const out = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      let l = line.replace(/([^:])\/\/.*$/, "$1").replace(/^\s*\/\/.*$/, "");
      if (/^\s*#(?!!)/.test(l)) return "";
      l = l.replace(/\s+#\s.*$/, "");
      return l;
    })
    .filter((line, idx, arr) => !(line.trim() === "" && (arr[idx - 1]?.trim() ?? "x") === ""))
    .join("\n");
  const saved = before - out.length;
  return {
    text: out,
    note: saved > 0 ? `Stripped comments (−${saved.toLocaleString()} chars)` : undefined,
  };
}

/** Replace high-entropy noise (UUIDs, timestamps, hashes) with short placeholders. */
export function normalizeNoise(text: string): TransformResult {
  let n = 0;
  const subs: Array<[RegExp, string]> = [
    [
      /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
      "<uuid>",
    ],
    [
      /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g,
      "<ts>",
    ],
    [/\b0x[0-9a-fA-F]{6,}\b/g, "<hex>"],
    [/\b[0-9a-fA-F]{32,}\b/g, "<hash>"],
  ];
  let out = text;
  for (const [re, rep] of subs) {
    out = out.replace(re, () => {
      n++;
      return rep;
    });
  }
  return {
    text: out,
    note: n > 0 ? `Normalized ${n.toLocaleString()} timestamps / IDs / hashes` : undefined,
  };
}

/** Drop low-information lines (separators, tiny lines, filler) by aggressiveness. */
export function dropLowInfoLines(text: string, aggressiveness: number): TransformResult {
  const lines = text.split("\n");
  let removed = 0;
  const out = lines.filter((line) => {
    const t = line.trim();
    if (t === "") return true;
    if (/^[-=_*~#.\s]{3,}$/.test(t)) {
      removed++;
      return false;
    }
    if (aggressiveness > 0.4 && t.length <= 2) {
      removed++;
      return false;
    }
    if (aggressiveness > 0.6 && /^(ok|done|info|debug|trace|null|undefined)$/i.test(t)) {
      removed++;
      return false;
    }
    return true;
  });
  return {
    text: out.join("\n"),
    note: removed > 0 ? `Dropped ${removed.toLocaleString()} low-information lines` : undefined,
  };
}

const FILLER = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "of",
  "to", "in", "on", "at", "for", "and", "or", "but", "so", "very", "just",
  "really", "actually", "basically", "that", "this", "these", "those",
  "please", "kindly", "then", "thus", "hence", "therefore", "however",
  "moreover", "furthermore", "additionally",
]);

/** LLMLingua-style: drop low-information tokens from prose-like lines. */
export function genericTokenReduce(text: string, aggressiveness: number): TransformResult {
  const before = text.length;
  const out = text.split("\n").map((line) => {
    if (/[{}[\];]|^\s*(at\s|File\s"|\$\s|>\s)/.test(line)) return line;
    const words = line.split(/(\s+)/);
    const filtered = words.filter((w) => {
      const t = w.toLowerCase().replace(/[^a-z']/g, "");
      if (t === "") return true;
      if (FILLER.has(t) && aggressiveness >= 0.3) return false;
      if (aggressiveness >= 0.7 && t.length <= 2 && !/^\d/.test(t)) return false;
      return true;
    });
    return filtered.join("").replace(/\s{2,}/g, " ").replace(/\s+$/, "");
  });
  const result = out.join("\n");
  const saved = before - result.length;
  return {
    text: result,
    note: saved > 0 ? `Dropped low-information tokens (−${saved.toLocaleString()} chars)` : undefined,
  };
}

/** Extractive summary: keep a fraction of sentences, biased to leading ones. */
export function extractiveSummary(text: string, keepRatio: number): TransformResult {
  const paras = text.split(/\n\s*\n/);
  const kept: string[] = [];
  let keptSentences = 0;
  let totalSentences = 0;
  for (const para of paras) {
    const p = para.trim();
    if (p === "") continue;
    if (/[{};]\s*$/.test(p) || /^\s*(at\s|File\s")/.test(p)) {
      kept.push(para);
      continue;
    }
    const sentences = p.split(/(?<=[.!?])\s+/).filter(Boolean);
    totalSentences += sentences.length;
    if (sentences.length <= 1) {
      kept.push(para);
      keptSentences += sentences.length;
      continue;
    }
    const keepN = Math.max(1, Math.round(sentences.length * keepRatio));
    const scored = sentences.map((s, idx) => ({
      s,
      idx,
      score: (idx === 0 ? 1000 : 0) + s.length,
    }));
    const chosen = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, keepN)
      .sort((a, b) => a.idx - b.idx);
    kept.push(chosen.map((c) => c.s).join(" "));
    keptSentences += chosen.length;
  }
  const dropped = totalSentences - keptSentences;
  return {
    text: kept.join("\n\n"),
    note:
      dropped > 0
        ? `Summarized prose (kept ${keptSentences} of ${totalSentences} sentences)`
        : undefined,
  };
}

/** Count consecutive/global duplicate lines for stats. */
export function countDuplicateLines(text: string): number {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const seen = new Set<string>();
  let dups = 0;
  for (const l of lines) {
    const k = l.trim();
    if (seen.has(k)) dups++;
    else seen.add(k);
  }
  return dups;
}
