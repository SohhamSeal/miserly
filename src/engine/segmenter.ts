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
 *
 * Safety posture: when in doubt, protect. A line we cannot confidently call
 * prose is better typed as structured content (and left alone) than typed prose
 * (and shredded). The `segment()` smoothing pass extends this to context: an
 * unrecognizable line sandwiched between two structured lines inherits their
 * type instead of falling through to prose.
 */
import type { ContentType } from "./types";

/**
 * Stack-frame shapes. The ellipsis alternative is anchored to Java's literal
 * "... 23 more" continuation — a bare `\.{3}\s` used to swallow ordinary
 * ellipsis-prefixed prose ("... then we monitor") as stack frames.
 */
export const FRAME_RE =
  /^\s*(at\s+\S|File\s+".*",\s*line\s+\d+|\.{3}\s+\d+\s+more\b|Caused by:|\tat\s)/;

/** A line that is a bare JSON scalar array element: `1,` `"red",` `true` `null,`. */
const JSON_SCALAR_RE =
  /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*"|true|false|null)\s*,?$/;

/** Statement shapes that identify keyword-less code lines (Python/Ruby/Go/…). */
const CODE_STATEMENT_RES: readonly RegExp[] = [
  // Block openers ending in ":" — for/if/while/try/with/def/match…
  /^(for|if|elif|else|while|try|except|finally|with|case|match|switch)\b.*:$/,
  // Assignments and augmented assignments: `x = 5`, `total += n`, `a.b[0] = x`
  /^[\w.[\]"']+\s*(=|\+=|-=|\*=|\/=|\/\/=|%=|\*\*=|&=|\|=|\^=|>>=|<<=)\s*\S/,
  // Bare flow-control statements
  /^(pass|break|continue|raise\b.*|yield\b.*|await\b.*|go\b.*|defer\b.*)$/,
];

/**
 * Assign a single dominant content type to a line (priority-ordered), or `null`
 * for a blank line. This is the ONLY place line-level type detection lives.
 *
 * Note: this per-line pass only ever returns a subset of ContentType —
 * stacktrace, json, code, sql, markdown, chat, logs, prose. Types like "mixed"
 * are document-level classifications and never appear on a segment.
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
  // Bare scalar array elements (`1,` / `"red",` / `null`) are data, not prose —
  // typing them json is what stops a line-pruner from emptying {"weights":[1,2,3]}.
  if (JSON_SCALAR_RE.test(l)) return "json";
  // TOON output (Toonify's table encoding). Headers `users[4]{id,name}:`,
  // inline scalar arrays `tags[3]: a,b,c`, and list items `- id: usr_1` /
  // `- "quoted item"`. These must be typed BEFORE the markdown bullet rule or
  // a later prose/markdown pass could prune or reword the data.
  if (/^[\w.$-]*\[\d+\]\s*(\{[^{}]*\})?:/.test(l)) return "json";
  if (/^-\s+([\w.$-]+|"(?:[^"\\]|\\.)*"):/.test(l)) return "json";
  if (/^-\s+("(?:[^"\\]|\\.)*"|\{\})\s*$/.test(l)) return "json";
  // Indented comma rows under a TOON table header (`  usr_000001,arjun,…`):
  // every field is quoted or spaceless. Misfiring on an indented code call like
  // `foo(a, b)` only OVER-protects (json and code enjoy the same guards).
  if (/^\s{2,}\S/.test(raw) && l.includes(",")) {
    const fields = l.split(",");
    if (
      fields.length >= 2 &&
      fields.every((f) => {
        const t = f.trim();
        return t.length > 0 && (/^".*"$/.test(t) || !/\s/.test(t));
      })
    )
      return "json";
  }
  // A line that is nothing but structural punctuation (`{`, `}`, `]`, `});`) is
  // syntax, not prose. Type it as code so it groups with the surrounding code /
  // JSON and is skipped by the prose & line-pruning transforms (otherwise a run
  // of nested closing braces could cluster into a prose segment and be merged).
  if (/^[{}[\]()<>;,]+$/.test(l)) return "code";
  // SQL needs structural evidence, not just a keyword: "Please UPDATE the docs"
  // is prose. SELECT requires FROM, UPDATE requires SET, and DDL is anchored.
  if (
    /\bSELECT\b[\s\S]+\bFROM\b/i.test(l) ||
    /^(INSERT\s+INTO|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX))\b/i.test(l) ||
    /^UPDATE\b.*\bSET\b/i.test(l)
  )
    return "sql";
  if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|)/.test(l) || /\[[^\]]+\]\([^)]+\)/.test(l))
    return "markdown";
  // Chat role markers use ":" or ">" — NOT "-", so "Human-generated content"
  // (which used to match the old `[:>\-]` class) now correctly stays prose.
  if (/^(user|assistant|system|human|ai|bot)\s*[:>]/i.test(l)) return "chat";
  // CSV-ish data rows: several short comma-separated fields with no sentence
  // shape. Typed json (structured) so dedupe/pruning leave the table intact.
  if (l.split(",").length >= 4 && !/[.!?]$/.test(l) && !/\b(and|or|the)\b/i.test(l)) {
    const fields = l.split(",");
    if (fields.every((f) => f.trim().length > 0 && f.trim().length <= 24)) return "json";
  }
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
  // Keyword-less statement shapes (Python assignments, `for x in xs:`, `pass`) —
  // these lines used to fall through to prose and get their keywords deleted.
  for (const re of CODE_STATEMENT_RES) if (re.test(l)) return "code";
  return "prose";
}

export interface Segment {
  type: ContentType;
  text: string;
}

/** Structured types that participate in context inheritance and setext checks. */
const STRUCTURED = new Set<ContentType>(["json", "code", "sql", "stacktrace"]);

/**
 * Split text into contiguous runs of a single content type. Blank lines attach
 * to the current run (so a prose paragraph is never shattered), and consecutive
 * same-type lines coalesce.
 *
 * Two context-aware corrections run before grouping:
 *  • Inheritance: a prose-typed line whose nearest typed neighbors (above and
 *    below) are BOTH the same structured type inherits that type — an odd line
 *    inside a JSON or code block must never become a prose island.
 *  • Setext underlines: a `===`/`---` line directly under a prose/markdown line
 *    is a heading underline, typed markdown (so separator-pruning spares it).
 */
export function segment(text: string): Segment[] {
  const lines = text.split("\n");
  const types: (ContentType | null)[] = lines.map(lineType);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (types[i] === "prose" && /^(={3,}|-{3,})$/.test(trimmed)) {
      const prev = i > 0 ? types[i - 1] : null;
      // A ===/--- run directly under a heading line is a setext underline. Type
      // BOTH the underline and the heading markdown so they land in one segment
      // — then the separator-pruning guard can see the heading as the previous
      // line and spare the underline (across a segment split it could not).
      if (prev === "prose" || prev === "markdown") {
        types[i] = "markdown";
        if (i > 0 && types[i - 1] === "prose") types[i - 1] = "markdown";
      }
      continue;
    }
    if (types[i] !== "prose") continue;
    let above: ContentType | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (types[j] !== null) {
        above = types[j];
        break;
      }
    }
    if (above === null || !STRUCTURED.has(above)) continue;
    let below: ContentType | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      if (types[j] !== null && types[j] !== "prose") {
        below = types[j];
        break;
      }
      // A prose line below breaks the sandwich — we're at a block boundary.
      if (types[j] === "prose") break;
    }
    if (below === above) types[i] = above;
  }

  const segments: Segment[] = [];
  let curType: ContentType | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    segments.push({ type: curType ?? "prose", text: buf.join("\n") });
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const t = types[i];
    if (t === null) {
      // Blank line: keep it with the current run without changing the run type.
      buf.push(lines[i]);
      continue;
    }
    if (curType === null || t === curType) {
      curType = t;
      buf.push(lines[i]);
    } else {
      flush();
      curType = t;
      buf.push(lines[i]);
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
