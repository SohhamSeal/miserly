import { clamp } from "@/lib/utils";
import { countTokens } from "./tokenizer";
import { lineType } from "./segmenter";
import { countDuplicateLines } from "./transforms";
import { TYPE_LABELS } from "./labels";
import type {
  ClassificationResult,
  ContentType,
  DetectedType,
  DocumentStats,
} from "./types";

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

/**
 * Measured token count per content type: classify each line and sum its real
 * token count. Used to build the budget charts from the actual text (before AND
 * after optimization) instead of guessing from input line-share.
 */
export function tokenDistributionByType(text: string): Map<ContentType, number> {
  const dist = new Map<ContentType, number>();
  for (const raw of text.split("\n")) {
    const t = lineType(raw);
    if (!t) continue;
    dist.set(t, (dist.get(t) ?? 0) + countTokens(raw));
  }
  return dist;
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

  // Whole-document probe: pretty-printed JSON puts each key on its own line, so
  // the per-line voting below (which needs a key AND a brace on the same line)
  // would mislabel an entire JSON file as prose — and route it straight into the
  // prose compressors. A real parse catches that up front.
  const trimmed = text.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return {
        primary: "json",
        secondary: null,
        detected: [{ type: "json", share: 1, confidence: 0.98 }],
        confidence: 0.98,
        reasons: ["Valid JSON document"],
        language: "JSON",
        complexity: complexityFor(stats, 1),
        stats,
      };
    } catch {
      // Not valid JSON — fall through to per-line classification.
    }
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
