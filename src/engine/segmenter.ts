/**
 * Segmentation — the single source of truth for "what kind of text is this?".
 *
 * Before this file existed, every risky transform re-guessed content type with
 * its own ad-hoc regex ("is this line JSON? code? prose?"). Those dialects
 * disagreed, which is how a prose compressor ended up deleting a JSON brace or
 * a Python keyword. Now there is ONE classifier (`lineType`), ONE way to split
 * a document into typed segments (`segment`), and ONE applicator
 * (`mapSafeSegments`) that guarantees a transform only ever sees the content
 * types it declared itself safe on.
 */
import type { ContentType } from "./types";

const FRAME_RE = /^\s*(at\s+\S|File\s+".*",\s*line\s+\d+|\.{3}\s|Caused by:|\tat\s)/;

/**
 * Assign a single dominant content type to a line (priority-ordered), or `null`
 * for a blank line. This is the ONLY place line-level type detection lives.
 */
export function lineType(raw: string): ContentType | null {
  const l = raw.trim();
  if (l === "") return null;
  if (FRAME_RE.test(raw)) return "stacktrace";
  // A quoted key followed by a colon is a pretty-printed JSON / config line even
  // when the surrounding braces sit on their own lines.
  if (/^\s*"[^"]{1,64}"\s*:/.test(l)) return "json";
  if (/"\w[\w-]*"\s*:/.test(l) && /[{}]/.test(l)) return "json";
  if ((l.startsWith("{") && l.endsWith("}")) || (l.startsWith("[") && l.endsWith("]")))
    return "json";
  // A line that is nothing but structural punctuation (`{`, `}`, `]`, `});`) is
  // syntax, not prose. Type it as code so it groups with the surrounding code /
  // JSON and is skipped by the prose & line-pruning transforms (otherwise a run
  // of nested closing braces could cluster into a prose segment and be merged).
  if (/^[{}[\]()<>;,]+$/.test(l)) return "code";
  if (/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(raw))
    return "sql";
  if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|)/.test(l) || /\[[^\]]+\]\([^)]+\)/.test(l))
    return "markdown";
  // Chat role markers use ":" or ">" — NOT "-", so "Human-generated content"
  // (which used to match the old `[:>\-]` class) now correctly stays prose.
  if (/^(user|assistant|system|human|ai|bot)\s*[:>]/i.test(l)) return "chat";
  // Logs must be tested BEFORE code: a log line routinely embeds code keywords
  // in its message ("... Failed to import module"), and the old order let the
  // `\bimport\b` code rule pre-empt the logs rule and mislabel the whole line.
  if (
    /\b(\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2})\b/.test(l) ||
    /\b(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\b/.test(l) ||
    /^\[\d{2,4}[-/]/.test(l)
  )
    return "logs";
  if (
    /(=>|;\s*$|\bfunction\b|\bconst\b|\blet\b|\bclass\b|\bdef\b|\bimport\b|\bexport\b|\breturn\b|\bpublic\b|\bprivate\b|#include|\bfn\b)/.test(
      raw,
    )
  )
    return "code";
  return "prose";
}

export interface Segment {
  type: ContentType;
  text: string;
}

/**
 * Split text into contiguous runs of a single content type. Blank lines attach
 * to the current run (so a prose paragraph is never shattered), and consecutive
 * same-type lines coalesce.
 *
 * Example — input:
 *   Deploy notes:            → prose
 *   {                        → json
 *     "retries": 3           → json
 *   }                        → json
 * yields two segments: { prose, "Deploy notes:" } and { json, '{\n  "retries": 3\n}' }.
 */
export function segment(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let curType: ContentType | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    segments.push({ type: curType ?? "prose", text: buf.join("\n") });
    buf = [];
  };

  for (const line of lines) {
    const t = lineType(line);
    if (t === null) {
      // Blank line: keep it with the current run without changing the run type.
      buf.push(line);
      continue;
    }
    if (curType === null || t === curType) {
      curType = t;
      buf.push(line);
    } else {
      flush();
      curType = t;
      buf.push(line);
    }
  }
  flush();
  return segments;
}

/**
 * Apply `fn` only to segments whose type is in `safeOn`; every other segment is
 * passed through byte-for-byte, then the whole document is stitched back
 * together. This is the guarantee that, e.g., a prose token-reducer can never
 * touch a JSON or code segment.
 */
export function mapSafeSegments(
  text: string,
  safeOn: readonly ContentType[],
  fn: (segmentText: string) => string,
): string {
  const safe = new Set(safeOn);
  return segment(text)
    .map((s) => (safe.has(s.type) ? fn(s.text) : s.text))
    .join("\n");
}
