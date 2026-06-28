import { clamp } from "@/lib/utils";
import { countTokens } from "./tokenizer";
import { countDuplicateLines } from "./transforms";
import { TYPE_LABELS } from "./labels";
import type {
  ClassificationResult,
  ContentType,
  DetectedType,
  DocumentStats,
} from "./types";

const FRAME_RE = /^\s*(at\s+\S|File\s+".*",\s*line\s+\d+|\.{3}\s|Caused by:|\tat\s)/;

export function computeStats(text: string): DocumentStats {
  const lines = text.split("\n");
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  const words = (text.match(/\S+/g) ?? []).length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== "").length;
  const uniqueLines = new Set(nonEmpty.map((l) => l.trim())).size;
  return {
    chars: text.length,
    words,
    lines: lines.length,
    paragraphs,
    tokens: countTokens(text),
    duplicateLines: countDuplicateLines(text),
    uniqueLines,
  };
}

/** Assign a single dominant content type to a line (priority-ordered). */
function lineType(raw: string): ContentType | null {
  const l = raw.trim();
  if (l === "") return null;
  if (FRAME_RE.test(raw)) return "stacktrace";
  if (/"\w[\w-]*"\s*:/.test(l) && /[{}]/.test(l)) return "json";
  if ((l.startsWith("{") && l.endsWith("}")) || (l.startsWith("[") && l.endsWith("]")))
    return "json";
  if (/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(raw))
    return "sql";
  if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|)/.test(l) || /\[[^\]]+\]\([^)]+\)/.test(l))
    return "markdown";
  if (/^(user|assistant|system|human|ai|bot)\b\s*[:>\-]/i.test(l)) return "chat";
  if (
    /(=>|;\s*$|\bfunction\b|\bconst\b|\blet\b|\bclass\b|\bdef\b|\bimport\b|\bexport\b|\breturn\b|\bpublic\b|\bprivate\b|#include|\bfn\b)/.test(
      raw,
    )
  )
    return "code";
  if (
    /\b(\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2})\b/.test(l) ||
    /\b(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\b/.test(l) ||
    /^\[\d{2,4}[-/]/.test(l)
  )
    return "logs";
  return "prose";
}

function detectProgLang(text: string): string | null {
  if (/\bdef\s+\w+\(|^\s*import\s+\w+|print\(/m.test(text)) return "Python";
  if (/\b(const|let|=>|function)\b|\binterface\s+\w+/.test(text))
    return /:\s*\w+(\[\])?\s*[=;),]/.test(text) ? "TypeScript" : "JavaScript";
  if (/\bpublic\s+(static\s+)?(class|void)|System\.out/.test(text)) return "Java";
  if (/#include|std::|int\s+main\s*\(/.test(text)) return "C/C++";
  if (/\bfn\s+\w+\(|let\s+mut\b/.test(text)) return "Rust";
  if (/\bpackage\s+main|\bfunc\s+\w+\(/.test(text)) return "Go";
  return null;
}

export function classify(
  text: string,
  override?: ContentType | "auto",
): ClassificationResult {
  const stats = computeStats(text);

  if (override && override !== "auto") {
    return {
      primary: override,
      secondary: null,
      detected: [{ type: override, share: 1, confidence: 0.99 }],
      confidence: 0.99,
      reasons: [`Content type manually set to ${TYPE_LABELS[override]}`],
      language: languageFor(override, text),
      complexity: complexityFor(stats, 1),
      stats,
    };
  }

  const lines = text.split("\n");
  const counts = new Map<ContentType, number>();
  let totalAssigned = 0;
  for (const raw of lines) {
    const t = lineType(raw);
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
    totalAssigned++;
  }
  if (totalAssigned === 0) {
    return {
      primary: "prose",
      secondary: null,
      detected: [{ type: "prose", share: 1, confidence: 0.7 }],
      confidence: 0.7,
      reasons: ["Mostly natural-language prose"],
      language: "English",
      complexity: complexityFor(stats, 1),
      stats,
    };
  }

  const detected: DetectedType[] = [...counts.entries()]
    .map(([type, n]) => ({
      type,
      share: n / totalAssigned,
      confidence: clamp(0.55 + (n / totalAssigned) * 0.4, 0.55, 0.98),
    }))
    .sort((a, b) => b.share - a.share);

  const significant = detected.filter((d) => d.share >= 0.15);
  let primary: ContentType = detected[0].type;
  if (significant.length >= 3) primary = "mixed";
  const secondary =
    detected.find((d) => d.type !== primary && d.share >= 0.12)?.type ?? null;

  const topShare = detected[0].share;
  const confidence =
    primary === "mixed"
      ? clamp(0.6 + significant.length * 0.06, 0.6, 0.9)
      : clamp(0.6 + topShare * 0.38, 0.6, 0.98);

  const reasons: string[] = [];
  if (counts.get("stacktrace")) reasons.push("Stack traces detected");
  if (counts.get("json")) reasons.push("Structured JSON detected");
  if (counts.get("logs")) reasons.push("Repeated timestamps and log levels");
  if (counts.get("code")) reasons.push("Code keywords and syntax");
  if (counts.get("markdown")) reasons.push("Markdown headings and lists");
  if (counts.get("chat")) reasons.push("Conversation role markers");
  if (counts.get("sql")) reasons.push("SQL statements");
  if (stats.duplicateLines > 0)
    reasons.push(`${stats.duplicateLines.toLocaleString()} duplicate lines`);
  if (reasons.length === 0) reasons.push("Mostly natural-language prose");

  return {
    primary,
    secondary,
    detected,
    confidence,
    reasons,
    language: languageFor(primary, text),
    complexity: complexityFor(stats, detected.length),
    stats,
  };
}

function languageFor(primary: ContentType, text: string): string {
  switch (primary) {
    case "json":
      return "JSON";
    case "sql":
      return "SQL";
    case "markdown":
      return "Markdown";
    case "logs":
    case "stacktrace":
      return detectProgLang(text) ? `Log output (${detectProgLang(text)})` : "Log output";
    case "code":
      return detectProgLang(text) ?? "Source code";
    case "chat":
    case "prose":
    case "rag":
    case "knowledge":
    case "mixed":
      return detectProgLang(text) ?? "English";
    default:
      return "English";
  }
}

function complexityFor(
  stats: DocumentStats,
  variety: number,
): "low" | "medium" | "high" {
  if (stats.tokens > 20000 || variety >= 4) return "high";
  if (stats.tokens > 3000 || variety >= 2) return "medium";
  return "low";
}
