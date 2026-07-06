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
import { FRAME_RE, mapSafeSegments, segment } from "./segmenter";
import { countTokens } from "./tokenizer";
import type { ContentType } from "./types";

export interface TransformResult {
  text: string;
  /** Human-readable note about what happened, for the activity log / stage card. */
  note?: string;
}

/** Types whose interior spacing is presentation, not data. */
const COLLAPSE_SAFE = new Set<ContentType>(["prose", "chat", "markdown", "logs"]);

/** Trim trailing whitespace, collapse internal runs of spaces, squeeze blank lines. */
export function collapseWhitespace(text: string): TransformResult {
  const before = text.length;
  // Interior runs of spaces are only collapsed in prose-ish segments — inside
  // code/JSON/SQL a run may sit inside a string literal ("a  b") where it is
  // data. Trailing-whitespace trim and blank-line squeezing are always safe.
  const collapsed = segment(text)
    .map((s) => {
      const lines = s.text.split("\n").map((line) => {
        const lead = line.match(/^[\t ]*/)?.[0] ?? "";
        let rest = line.slice(lead.length).replace(/\s+$/, "");
        if (COLLAPSE_SAFE.has(s.type)) rest = rest.replace(/[ \t]{2,}/g, " ");
        return lead + rest;
      });
      return lines.join("\n");
    })
    .join("\n");
  const out = collapsed.replace(/\n{3,}/g, "\n\n").trim();
  const saved = before - out.length;
  return {
    text: out,
    note: saved > 0 ? `Collapsed whitespace (−${saved.toLocaleString()} chars)` : undefined,
  };
}

/**
 * Types where two identical lines are genuinely redundant (repeated log or
 * prose lines). Explicitly NOT code or JSON: `}` and `return 1;` legitimately
 * recur, and merging them silently deletes a second function's body and braces.
 * (lineType only ever emits stacktrace/json/code/sql/markdown/chat/logs/prose,
 * so these lists name only types a segment can actually carry.)
 */
const DEDUPE_SAFE: readonly ContentType[] = ["logs", "prose", "chat"];

/** Collapse consecutive identical lines into one annotated line (safe segments only). */
/**
 * A line that is one complete, standalone JSON object — a JSONL record. Array
 * ELEMENT lines are excluded automatically: every duplicate of an element
 * inside a JSON array carries a trailing comma (only the last element lacks
 * one), so identical complete-object lines can only be free-standing records —
 * and folding those is safe, unlike folding array elements or code braces.
 */
function isJsonlRecord(line: string): boolean {
  const t = line.trim();
  if (!(t.startsWith("{") && t.endsWith("}"))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

export function dedupeConsecutiveLines(text: string): TransformResult {
  let collapsed = 0;
  const foldRuns = (lines: string[], eligible: (l: string) => boolean): string[] => {
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const cur = lines[i];
      let run = 1;
      while (i + run < lines.length && lines[i + run] === cur) run++;
      if (run > 1 && cur.trim() !== "" && eligible(cur)) {
        out.push(`${cur}  ⟲ ×${run}`);
        collapsed += run - 1;
      } else {
        for (let k = 0; k < run; k++) out.push(cur);
      }
      i += run;
    }
    return out;
  };
  // Same safety contract as global dedupe: repeated `retry();` statements or
  // identical JSON scalar lines are structure, not noise.
  const guarded = mapSafeSegments(text, DEDUPE_SAFE, (block) =>
    foldRuns(block.split("\n"), () => true).join("\n"),
  );
  // JSONL exception: identical free-standing JSON records (log/event streams)
  // ARE noise even though they sit in json-typed segments the guard skips.
  const out = foldRuns(guarded.split("\n"), isJsonlRecord).join("\n");
  return {
    text: out,
    note: collapsed > 0 ? `Collapsed ${collapsed.toLocaleString()} repeated lines` : undefined,
  };
}

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

/** Matches a JSON numeric literal. */
const JSON_NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/**
 * Whether a JSON block carries a number float64 cannot round-trip exactly.
 * Precision loss depends on TOTAL significant digits, not on which side of the
 * decimal point they sit — `9999999999.9999999` (17 sig digits, neither side
 * ≥16) is corrupted to `10000000000` just as surely as a 19-digit snowflake id.
 * float64 holds ~15–17 significant decimal digits; refusing at >15 is safe (an
 * over-refusal just leaves the block pretty-printed, never corrupted).
 */
function hasPrecisionRisk(block: string): boolean {
  const matches = block.match(JSON_NUMBER_RE);
  if (!matches) return false;
  for (const lit of matches) {
    // Significant digits = mantissa digits minus leading and trailing zeros.
    const mantissa = lit.replace(/^-/, "").split(/[eE]/)[0].replace(".", "");
    const sig = mantissa.replace(/^0+/, "").replace(/0+$/, "");
    if (sig.length > 15) return true;
  }
  return false;
}

/** Minify pretty-printed / structured JSON blocks and lines. */
export function minifyJsonBlocks(text: string): TransformResult {
  let changed = 0;
  const tryMin = (s: string): string | null => {
    const t = s.trim();
    const looksJson =
      (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
    if (!looksJson) return null;
    // Refuse to round-trip blocks carrying numbers float64 cannot hold — the
    // block stays pretty-printed rather than getting a corrupted ID.
    if (hasPrecisionRisk(t)) return null;
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

/* ------------------------------------------------------------------ */
/* TOON encoding (Toonify) — re-encode JSON so repeated keys are paid  */
/* for once, with a measured calculator deciding table vs minified.   */
/* ------------------------------------------------------------------ */

/** Key safe to emit bare (unquoted) in TOON output. */
const TOON_BARE_KEY_RE = /^[A-Za-z_][\w.-]*$/;
/** A bare string that would be misread as a number/bool/null on the way back. */
const TOON_AMBIGUOUS_RE = /^(true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;

/**
 * Encode a string value. Quotes are kept whenever the value contains anything
 * the row/mapping grammar uses (commas, colons, braces), any whitespace (the
 * segmenter's structured-line rules key off "quoted or spaceless"), or a
 * numeric/bool lookalike. Spaceless identifiers — ids, emails, slugs, ISO
 * timestamps — go bare, which is where most of the quote savings come from.
 */
function toonString(s: string): string {
  if (s === "" || /[\s",:{}[\]\\#]/.test(s) || TOON_AMBIGUOUS_RE.test(s) || s.startsWith("-")) {
    return JSON.stringify(s);
  }
  return s;
}

function toonScalar(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return toonString(v);
  return String(v);
}

function isToonScalar(v: unknown): boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function toonKey(k: string): string {
  return TOON_BARE_KEY_RE.test(k) ? k : JSON.stringify(k);
}

/**
 * Flatten one record into dot-path cells (`address.city`, `stats.total_orders`)
 * so records with NESTED objects can still share one table header. Scalar
 * arrays become a single pipe-joined cell. Returns null when the record holds
 * an array of objects (those keep the list form — a table cell can't hold a
 * sub-table honestly).
 */
function flattenRecord(el: unknown): Map<string, unknown> | null {
  if (typeof el !== "object" || el === null || Array.isArray(el)) return null;
  const out = new Map<string, unknown>();
  const walk = (obj: Record<string, unknown>, prefix: string): boolean => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (isToonScalar(v)) {
        out.set(key, v);
      } else if (Array.isArray(v)) {
        if (!v.every(isToonScalar)) return false;
        out.set(key, v);
      } else if (!walk(v as Record<string, unknown>, key)) {
        return false;
      }
    }
    return true;
  };
  return walk(el as Record<string, unknown>, "") ? out : null;
}

/** One table cell. Scalar arrays are pipe-joined; a missing key is empty. */
function toonCell(v: unknown): string {
  if (v === undefined) return "";
  if (Array.isArray(v)) {
    const joined = v.map(toonScalar).join("|");
    return /[\s,"]/.test(joined) ? JSON.stringify(v.map(String).join("|")) : joined;
  }
  return toonScalar(v);
}

/**
 * Tabular encoding of an array of ≥2 records: shared header (first-seen column
 * union across all records — records may miss keys; the cell is just empty),
 * one CSV row per record. Null when any record can't flatten.
 */
function buildTableLines(label: string, arr: unknown[], indent: string): string[] | null {
  if (arr.length < 2) return null;
  const flats: Map<string, unknown>[] = [];
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const el of arr) {
    const flat = flattenRecord(el);
    if (flat === null || flat.size === 0) return null;
    flats.push(flat);
    for (const k of flat.keys()) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  const lines = [`${indent}${label}[${arr.length}]{${cols.map(toonKey).join(",")}}:`];
  for (const flat of flats) {
    lines.push(`${indent}  ${cols.map((c) => toonCell(flat.get(c))).join(",")}`);
  }
  return lines;
}

function encodeToonValue(
  key: string | null,
  value: unknown,
  indent: string,
  lines: string[],
): void {
  const label = key === null ? "" : toonKey(key);
  if (isToonScalar(value)) {
    lines.push(indent + (key === null ? "" : label + ": ") + toonScalar(value));
    return;
  }
  if (Array.isArray(value)) {
    const n = value.length;
    if (n === 0) {
      lines.push(`${indent}${label}[0]:`);
      return;
    }
    if (value.every(isToonScalar)) {
      lines.push(`${indent}${label}[${n}]: ${value.map(toonScalar).join(",")}`);
      return;
    }
    // The headline TOON move: keys declared once, one CSV row per record —
    // nested objects flattened into dot-path columns. The list form is always
    // built too, and a measured token count picks the smaller of the two.
    const table = buildTableLines(label, value, indent);
    const list = buildListLines(label, value, indent);
    if (table !== null && countTokens(table.join("\n")) <= countTokens(list.join("\n"))) {
      lines.push(...table);
    } else {
      lines.push(...list);
    }
    return;
  }
  // Plain object.
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    lines.push(`${indent}${label}: {}`);
    return;
  }
  lines.push(`${indent}${label}:`);
  for (const [k, v] of entries) encodeToonValue(k, v, indent + "  ", lines);
}

/**
 * List-block encoding of an array with mixed/nested elements. Object items put
 * their first field inline after "- " so no bare one-character "-" line ever
 * exists (a later low-info line pass would delete it).
 */
function buildListLines(label: string, arr: unknown[], indent: string): string[] {
  const lines: string[] = [`${indent}${label}[${arr.length}]:`];
  for (const el of arr) {
    if (isToonScalar(el)) {
      lines.push(`${indent}  - ${toonScalar(el)}`);
      continue;
    }
    if (Array.isArray(el)) {
      encodeToonValue(null, el, indent + "  - ", lines);
      continue;
    }
    const entries = Object.entries(el as Record<string, unknown>);
    if (entries.length === 0) {
      lines.push(`${indent}  - {}`);
      continue;
    }
    const [firstK, firstV] = entries[0];
    if (isToonScalar(firstV)) {
      lines.push(`${indent}  - ${toonKey(firstK)}: ${toonScalar(firstV)}`);
    } else {
      lines.push(`${indent}  - ${toonKey(firstK)}:`);
      encodeToonBody(firstV, indent + "      ", lines);
    }
    for (const [k, v] of entries.slice(1)) {
      encodeToonValue(k, v, indent + "    ", lines);
    }
  }
  return lines;
}

/** Encode the children of an already-labelled object/array. */
function encodeToonBody(value: unknown, indent: string, lines: string[]): void {
  if (Array.isArray(value) || isToonScalar(value)) {
    encodeToonValue(null, value, indent, lines);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    encodeToonValue(k, v, indent, lines);
  }
}

/** Full-document TOON encoding of a parsed JSON value. */
export function encodeToon(value: unknown): string {
  const lines: string[] = [];
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      encodeToonValue(k, v, "", lines);
    }
  } else {
    encodeToonValue(null, value, "", lines);
  }
  return lines.join("\n");
}

/**
 * Toonify's core: for each JSON block, encode it BOTH ways — TOON and plain
 * minified JSON — measure the token count of each, and ship whichever is
 * smaller. That measured choice is the whole point: tables win big on uniform
 * record arrays (keys paid for once) but can lose on deeply irregular data,
 * so the decision is made per block from real counts, never assumed.
 */
export function toonifyJsonBlocks(text: string): TransformResult {
  let tables = 0;
  let minified = 0;
  const tryEncode = (s: string): string | null => {
    const t = s.trim();
    const looksJson =
      (t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"));
    if (!looksJson) return null;
    // Same rule as minifyJsonBlocks: numbers float64 can't hold are never
    // round-tripped — the block stays exactly as it was.
    if (hasPrecisionRisk(t)) return null;
    try {
      const parsed = JSON.parse(t);
      const min = JSON.stringify(parsed);
      const toon = encodeToon(parsed);
      const useToon = countTokens(toon) < countTokens(min);
      const winner = useToon ? toon : min;
      if (countTokens(winner) >= countTokens(s)) return null;
      if (useToon) tables++;
      else minified++;
      return winner;
    } catch {
      return null;
    }
  };

  // JSONL streams (one standalone record per line — K8s events, structured
  // logs) are morally one table: fold each run of ≥2 consecutive records into
  // an array and let the same measured table-vs-original comparison decide.
  let jsonlRuns = 0;
  const foldJsonlRuns = (input: string): string => {
    const lines = input.split("\n");
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
      if (!isJsonlRecord(lines[i])) {
        out.push(lines[i]);
        i++;
        continue;
      }
      let j = i;
      while (j < lines.length && isJsonlRecord(lines[j])) j++;
      const run = lines.slice(i, j);
      if (j - i >= 2 && !hasPrecisionRisk(run.join("\n"))) {
        try {
          const arr = run.map((l) => JSON.parse(l.trim()));
          const toon = encodeToon(arr);
          if (countTokens(toon) < countTokens(run.join("\n"))) {
            out.push(...toon.split("\n"));
            jsonlRuns++;
            i = j;
            continue;
          }
        } catch {
          // fall through — keep the run as-is
        }
      }
      out.push(...run);
      i = j;
    }
    return out.join("\n");
  };

  const blocks = text.split(/\n\s*\n/).map((block) => tryEncode(block) ?? block);
  const out = foldJsonlRuns(blocks.join("\n\n"))
    .split("\n")
    .map((line) => (line.trim().length > 40 ? (tryEncode(line) ?? line) : line))
    .join("\n");

  const parts: string[] = [];
  if (tables > 0) parts.push(`re-encoded ${tables} JSON block(s) as TOON tables (keys declared once)`);
  if (jsonlRuns > 0) parts.push(`folded ${jsonlRuns} JSONL record run(s) into TOON tables`);
  if (minified > 0) parts.push(`kept ${minified} block(s) as minified JSON (measured smaller than a table)`);
  return {
    text: out,
    note: parts.length ? parts.join("; ").replace(/^./, (c) => c.toUpperCase()) : undefined,
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
  let inTemplate = false;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (c === "\\") {
      // Escape: the next character is literal, never a quote toggle.
      i++;
      continue;
    }
    if (c === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    else if (c === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    else if (c === "`" && !inSingle && !inDouble) inTemplate = !inTemplate;
    else if (c === "/" && line[i + 1] === "/" && !inSingle && !inDouble && !inTemplate) {
      const prev = i === 0 ? "" : line[i - 1];
      if (i === 0 || /\s/.test(prev)) return line.slice(0, i).replace(/\s+$/, "");
    }
  }
  return line;
}

// Remove C-style block comments with string awareness: a comment opener inside
// a quoted or template string (e.g. the middle of a glob like "src/x/*.test.ts")
// is content, not a comment. Runs per segment, so an unclosed opener in code can
// never join with a closer in a later prose segment and swallow everything
// between them.
function stripBlockComments(seg: string): string {
  let out = "";
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === "\\" && (inSingle || inDouble || inTemplate)) {
      out += c + (seg[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
    else if (c === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
    else if (c === "`" && !inSingle && !inDouble) inTemplate = !inTemplate;
    else if (
      c === "/" &&
      seg[i + 1] === "*" &&
      !inSingle &&
      !inDouble &&
      !inTemplate
    ) {
      const close = seg.indexOf("*/", i + 2);
      if (close !== -1) {
        i = close + 1;
        continue;
      }
    }
    out += c;
  }
  return out;
}

/** Best-effort comment removal for code (block, line, and inline #-style). */
export function stripComments(text: string): TransformResult {
  const before = text.length;
  const out = mapSafeSegments(text, COMMENT_SAFE, (seg) =>
    stripBlockComments(seg)
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

/**
 * The high-entropy noise shapes `normalizeNoise` rewrites. Exported so the
 * validator can exempt them: an ID the engine DELIBERATELY replaced with a
 * placeholder is not "lost information" and must not tank entity retention.
 */
export const NOISE_SUBS: ReadonlyArray<readonly [RegExp, string]> = [
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

/** Replace high-entropy noise (UUIDs, timestamps, hashes) with short placeholders. */
export function normalizeNoise(text: string): TransformResult {
  let n = 0;
  const subs = NOISE_SUBS;
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
const DROP_SAFE: readonly ContentType[] = ["logs", "prose", "chat", "markdown"];
const STRUCTURAL_ONLY = /^[{}[\]()<>;,]+$/;

/** Drop low-information lines (separators, tiny lines, filler) by aggressiveness. */
export function dropLowInfoLines(text: string, aggressiveness: number): TransformResult {
  let removed = 0;
  const result = mapSafeSegments(text, DROP_SAFE, (block) => {
    const lines = block.split("\n");
    return lines
      .filter((line, idx) => {
        const t = line.trim();
        if (t === "") return true;
        // Never delete a purely structural line (`}`, `],`, `);`) — it carries
        // syntax, not information noise.
        if (STRUCTURAL_ONLY.test(t)) return true;
        // Bare numbers are data (counts, ids, table cells), not filler.
        if (/^-?\d+([.,]\d+)?,?$/.test(t)) return true;
        if (/^[-=_*~#.\s]{3,}$/.test(t)) {
          // A ===/--- run directly under a non-blank line is a setext heading
          // underline — deleting it silently demotes the heading to plain text.
          const prev = idx > 0 ? lines[idx - 1].trim() : "";
          if (/^(={3,}|-{3,})$/.test(t) && prev !== "") return true;
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
      .join("\n");
  });
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
const PROSE_SAFE: readonly ContentType[] = ["prose", "chat", "markdown"];

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
const SUMMARY_SAFE: readonly ContentType[] = ["prose", "chat", "markdown"];

/**
 * Extractive summary: keep a fraction of sentences.
 *
 * The keep budget is global over the segment (so a many-short-paragraph document
 * still compresses instead of being pinned open by a per-paragraph floor), BUT
 * every non-passthrough paragraph is guaranteed to keep at least its lead
 * sentence. Without that guarantee a global top-N by score silently deletes
 * whole trailing paragraphs — e.g. a document's Conclusion vanishing. Any budget
 * beyond one-lead-per-paragraph is distributed globally by sentence salience.
 */
export function extractiveSummary(text: string, keepRatio: number): TransformResult {
  let keptSentences = 0;
  let totalSentences = 0;
  const summarizeBlock = (block: string): string => {
    const paras = block.split(/\n\s*\n/);
    interface Cand {
      paraIdx: number;
      sentIdx: number;
      s: string;
      score: number;
    }
    const passthrough = new Map<number, string>();
    const candidates: Cand[] = [];
    for (let paraIdx = 0; paraIdx < paras.length; paraIdx++) {
      const para = paras[paraIdx];
      const p = para.trim();
      if (p === "") continue;
      if (/[{};]\s*$/.test(p) || /^\s*(at\s|File\s")/.test(p)) {
        passthrough.set(paraIdx, para);
        continue;
      }
      const sentences = p.split(/(?<=[.!?])\s+/).filter(Boolean);
      totalSentences += sentences.length;
      sentences.forEach((s, sentIdx) => {
        candidates.push({
          paraIdx,
          sentIdx,
          s,
          // Salience by lead-position and length; NOT biased by paragraph index,
          // so selection doesn't systematically favor the front of the document.
          score: (sentIdx === 0 ? 1000 : 0) + s.length,
        });
      });
    }

    const chosen = new Set<Cand>();
    // 1. Guarantee each paragraph's lead sentence survives — no paragraph is
    //    ever dropped wholesale.
    const leadByPara = new Map<number, Cand>();
    for (const c of candidates) {
      if (c.sentIdx === 0) leadByPara.set(c.paraIdx, c);
    }
    for (const lead of leadByPara.values()) chosen.add(lead);

    // 2. Fill the remaining global budget with the highest-salience non-lead
    //    sentences.
    const keepN = Math.max(chosen.size, Math.round(candidates.length * keepRatio));
    const rest = candidates
      .filter((c) => !chosen.has(c))
      .sort((a, b) => b.score - a.score);
    for (const c of rest) {
      if (chosen.size >= keepN) break;
      chosen.add(c);
    }
    keptSentences += chosen.size;

    const kept: string[] = [];
    for (let paraIdx = 0; paraIdx < paras.length; paraIdx++) {
      if (passthrough.has(paraIdx)) {
        kept.push(passthrough.get(paraIdx)!);
        continue;
      }
      const sel = candidates
        .filter((c) => c.paraIdx === paraIdx && chosen.has(c))
        .sort((a, b) => a.sentIdx - b.sentIdx);
      if (sel.length > 0) kept.push(sel.map((c) => c.s).join(" "));
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
