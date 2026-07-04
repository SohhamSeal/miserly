/**
 * Real, coherent text transforms.
 *
 * Every optimizer in miserly is built from these. They are deterministic and
 * actually shrink the text, so the original→optimized token counts and costs
 * shown in the UI are TRUE measurements, not fabricated numbers. The
 * "algorithm" of each optimizer is which transforms it composes and how hard.
 *
 * Safety model: transforms that could corrupt structured content declare the
 * content types they are safe on and run through `mapSafeSegments`, so a prose
 * reducer physically never sees a JSON or code segment. There is exactly one
 * classifier (`segmenter.lineType`) behind that guarantee — no per-transform
 * regex re-guessing.
 */
import { mapSafeSegments } from "./segmenter";
import type { ContentType } from "./types";

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

/**
 * Types where two identical lines are genuinely redundant (repeated log or
 * prose lines). Explicitly NOT code or JSON: `}` and `return 1;` legitimately
 * recur, and merging them silently deletes a second function's body and braces.
 */
const DEDUPE_SAFE: readonly ContentType[] = ["logs", "prose", "chat", "mixed"];

/** Deduplicate identical lines within safe segments (keep first, annotate count). */
export function dedupeGlobalLines(text: string): TransformResult {
  let removed = 0;
  const dedupeWithin = (block: string): string => {
    const lines = block.split("\n");
    const seenAt = new Map<string, number>();
    const out: string[] = [];
    const counts = new Map<number, number>();
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
    return out.join("\n");
  };
  return {
    text: mapSafeSegments(text, DEDUPE_SAFE, dedupeWithin),
    note: removed > 0 ? `Deduplicated ${removed.toLocaleString()} repeated lines` : undefined,
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

/** Content types where comment syntax is meaningful. */
const COMMENT_SAFE: readonly ContentType[] = ["code", "mixed"];

/**
 * Strip a `//` line comment, but only when the `//` sits OUTSIDE a string
 * literal and is at the line start or preceded by whitespace. This preserves
 * both URLs ("http://…", where `//` follows ":") and string contents
 * (`const s = "foo // bar";`, where the `//` is inside quotes and must survive).
 */
function stripLineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "/" && line[i + 1] === "/" && !inSingle && !inDouble) {
      const prev = i === 0 ? "" : line[i - 1];
      if (i === 0 || /\s/.test(prev)) return line.slice(0, i).replace(/\s+$/, "");
    }
  }
  return line;
}

/** Best-effort comment removal for code (block, line, and inline #-style). */
export function stripComments(text: string): TransformResult {
  const before = text.length;
  // Block comments are unambiguous — remove them wherever they appear.
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = mapSafeSegments(noBlocks, COMMENT_SAFE, (seg) =>
    seg
      .split("\n")
      .map((line) =>
        // Inline "# comment" (space-hash-space); never a whole "#…" line, which
        // would erase preprocessor directives (#include) and headings (# Title).
        stripLineComment(line).replace(/\s+#\s.*$/, ""),
      )
      .join("\n"),
  )
    .split("\n")
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

/**
 * Line-pruning is unsafe on structured content: a lone `}` or `]` is a
 * 1-character line the old rule happily deleted, corrupting the JSON/code
 * around it. Restrict pruning to noisy text types, and never remove a line made
 * purely of structural punctuation.
 */
const DROP_SAFE: readonly ContentType[] = ["logs", "prose", "chat", "markdown", "mixed"];
const STRUCTURAL_ONLY = /^[{}[\]()<>;,]+$/;

/** Drop low-information lines (separators, tiny lines, filler) by aggressiveness. */
export function dropLowInfoLines(text: string, aggressiveness: number): TransformResult {
  let removed = 0;
  const result = mapSafeSegments(text, DROP_SAFE, (block) =>
    block
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (t === "") return true;
        // Never delete a purely structural line (`}`, `],`, `);`) — it carries
        // syntax, not information noise.
        if (STRUCTURAL_ONLY.test(t)) return true;
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
      })
      .join("\n"),
  );
  return {
    text: result,
    note: removed > 0 ? `Dropped ${removed.toLocaleString()} low-information lines` : undefined,
  };
}

// Two-tier filler. SOFT words (articles, intensifiers, hedges) carry almost no
// meaning and are safe to drop at the balanced default. HARD words are
// logic-bearing connectives and prepositions — dropping "but"/"or"/"however"
// can flip meaning ("succeeded, but failed" → "succeeded failed"), and "in"/"of"
// double as code keywords — so they only go at very high aggressiveness.
const FILLER_SOFT = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "very", "just", "really", "actually", "basically",
  "that", "this", "these", "those", "please", "kindly",
]);
const FILLER_HARD = new Set([
  "of", "to", "in", "on", "at", "for", "and", "or", "but", "so", "nor", "yet",
  "then", "thus", "hence", "therefore", "however", "moreover", "furthermore",
  "additionally",
]);

/** Prose types where token-level reduction is meaningful and safe. */
const PROSE_SAFE: readonly ContentType[] = ["prose", "chat", "markdown", "rag", "knowledge"];

/** LLMLingua-style: drop low-information tokens from prose/chat segments. */
export function genericTokenReduce(text: string, aggressiveness: number): TransformResult {
  const before = text.length;
  const result = mapSafeSegments(text, PROSE_SAFE, (block) =>
    block
      .split("\n")
      .map((line) => {
        const lead = line.match(/^[\t ]*/)?.[0] ?? "";
        const words = line.slice(lead.length).split(/(\s+)/);
        const filtered = words.filter((w) => {
          if (w === "" || /\s/.test(w)) return true;
          // Keep any token carrying structural punctuation (quoted values,
          // "key:", commas, a chat "User:" role marker). Keeping the role marker
          // is what lets chat transcripts reduce their message, not structure.
          if (/["'{}()[\]:,=]/.test(w)) return true;
          const t = w.toLowerCase().replace(/[^a-z']/g, "");
          if (t === "") return true;
          if (FILLER_SOFT.has(t) && aggressiveness >= 0.3) return false;
          if (FILLER_HARD.has(t) && aggressiveness >= 0.85) return false;
          if (aggressiveness >= 0.7 && t.length <= 2 && !/^\d/.test(t)) return false;
          return true;
        });
        return lead + filtered.join("").replace(/[ \t]{2,}/g, " ").replace(/\s+$/, "");
      })
      .join("\n"),
  );
  const saved = before - result.length;
  return {
    text: result,
    note: saved > 0 ? `Dropped low-information tokens (−${saved.toLocaleString()} chars)` : undefined,
  };
}

/** Prose types where sentence-level summarization is meaningful. */
const SUMMARY_SAFE: readonly ContentType[] = ["prose", "chat", "markdown", "rag", "knowledge"];

/** Extractive summary: keep a fraction of sentences, biased to leading ones. */
export function extractiveSummary(text: string, keepRatio: number): TransformResult {
  let keptSentences = 0;
  let totalSentences = 0;
  const summarizeBlock = (block: string): string => {
    const paras = block.split(/\n\s*\n/);
    const kept: string[] = [];
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
    return kept.join("\n\n");
  };
  const result = mapSafeSegments(text, SUMMARY_SAFE, summarizeBlock);
  const dropped = totalSentences - keptSentences;
  return {
    text: result,
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
